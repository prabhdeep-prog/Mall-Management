import { db } from "@/lib/db"
import {
  importJobs,
  tenants,
  leases,
  vendors,
  posSalesData,
  properties,
} from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

// ── Types ────────────────────────────────────────────────────────────────────

interface RowError {
  row: number
  data: Record<string, string>
  error: string
}

type ImportType = "tenants" | "leases" | "vendors" | "sales"

// ── CSV Parsing ──────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "")
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase())
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line)
    const record: Record<string, string> = {}
    headers.forEach((h, i) => {
      record[h] = (values[i] ?? "").trim()
    })
    return record
  })

  return { headers, rows }
}

function parseLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ── Validators ───────────────────────────────────────────────────────────────

const REQUIRED_HEADERS: Record<ImportType, string[]> = {
  tenants: ["name", "email", "property", "unit", "area_sqft"],
  leases: ["tenant", "start_date", "end_date", "mg", "rev_share"],
  vendors: ["name", "category", "contact", "email"],
  sales: ["tenant", "date", "gross", "net", "method"],
}

function validateHeaders(type: ImportType, headers: string[]): string | null {
  const required = REQUIRED_HEADERS[type]
  const missing = required.filter((h) => !headers.includes(h))
  if (missing.length > 0) {
    return `Missing required columns: ${missing.join(", ")}`
  }
  return null
}

function validateTenantRow(row: Record<string, string>): string | null {
  if (!row.name) return "name is required"
  if (!row.property) return "property is required"
  if (!row.unit) return "unit is required"
  if (!row.area_sqft || isNaN(Number(row.area_sqft))) return "area_sqft must be a number"
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return "invalid email format"
  return null
}

function validateLeaseRow(row: Record<string, string>): string | null {
  if (!row.tenant) return "tenant is required"
  if (!row.start_date) return "start_date is required"
  if (!row.end_date) return "end_date is required"
  if (isNaN(Date.parse(row.start_date))) return "start_date is not a valid date"
  if (isNaN(Date.parse(row.end_date))) return "end_date is not a valid date"
  if (row.mg && isNaN(Number(row.mg))) return "mg must be a number"
  if (row.rev_share && isNaN(Number(row.rev_share))) return "rev_share must be a number"
  return null
}

function validateVendorRow(row: Record<string, string>): string | null {
  if (!row.name) return "name is required"
  if (!row.category) return "category is required"
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return "invalid email format"
  return null
}

function validateSalesRow(row: Record<string, string>): string | null {
  if (!row.tenant) return "tenant is required"
  if (!row.date) return "date is required"
  if (isNaN(Date.parse(row.date))) return "date is not a valid date"
  if (!row.gross || isNaN(Number(row.gross))) return "gross must be a number"
  if (!row.net || isNaN(Number(row.net))) return "net must be a number"
  return null
}

const VALIDATORS: Record<ImportType, (row: Record<string, string>) => string | null> = {
  tenants: validateTenantRow,
  leases: validateLeaseRow,
  vendors: validateVendorRow,
  sales: validateSalesRow,
}

// ── Row Processors (batch insert) ────────────────────────────────────────────

async function insertTenants(
  rows: Record<string, string>[],
  orgId: string
) {
  // Resolve property codes → IDs
  const propertyCodes = [...new Set(rows.map((r) => r.property))]
  const propertyRows = await db
    .select({ id: properties.id, code: properties.code })
    .from(properties)

  const codeToId = new Map(
    propertyRows
      .filter((p) => propertyCodes.includes(p.code))
      .map((p) => [p.code, p.id])
  )

  const values = rows.map((row) => ({
    propertyId: codeToId.get(row.property) ?? null,
    businessName: row.name,
    email: row.email || null,
    contactPerson: row.contact || null,
    phone: row.phone || null,
    status: "active" as const,
  }))

  // Filter out rows without a valid property
  const valid = values.filter((v) => v.propertyId !== null)
  if (valid.length > 0) {
    await db.insert(tenants).values(valid as any)
  }
  return valid.length
}

async function insertLeases(
  rows: Record<string, string>[],
  orgId: string
) {
  // Resolve tenant business names → IDs
  const tenantNames = [...new Set(rows.map((r) => r.tenant))]
  const tenantRows = await db
    .select({ id: tenants.id, businessName: tenants.businessName, propertyId: tenants.propertyId })
    .from(tenants)

  const nameToTenant = new Map(
    tenantRows
      .filter((t) => tenantNames.includes(t.businessName))
      .map((t) => [t.businessName, t])
  )

  const values = rows
    .filter((row) => nameToTenant.has(row.tenant))
    .map((row) => {
      const tenant = nameToTenant.get(row.tenant)!
      return {
        tenantId: tenant.id,
        propertyId: tenant.propertyId,
        unitNumber: row.unit || "TBD",
        areaSqft: row.area_sqft || "0",
        leaseType: "fixed_rent" as const,
        baseRent: row.rent || "0",
        monthlyMg: row.mg || "0",
        revenueSharePercentage: row.rev_share || "0",
        startDate: row.start_date,
        endDate: row.end_date,
        status: "active" as const,
      }
    })

  if (values.length > 0) {
    await db.insert(leases).values(values)
  }
  return values.length
}

async function insertVendors(rows: Record<string, string>[]) {
  const values = rows.map((row) => ({
    name: row.name,
    type: row.category || null,
    contactPerson: row.contact || null,
    email: row.email || null,
    phone: row.phone || null,
    status: "active" as const,
  }))

  if (values.length > 0) {
    await db.insert(vendors).values(values)
  }
  return values.length
}

async function insertSales(
  rows: Record<string, string>[],
  orgId: string
) {
  // Resolve tenant names → tenant + lease + POS integration
  const tenantNames = [...new Set(rows.map((r) => r.tenant))]
  const tenantRows = await db
    .select({ id: tenants.id, businessName: tenants.businessName, propertyId: tenants.propertyId })
    .from(tenants)

  const nameToTenant = new Map(
    tenantRows
      .filter((t) => tenantNames.includes(t.businessName))
      .map((t) => [t.businessName, t])
  )

  const values = rows
    .filter((row) => nameToTenant.has(row.tenant))
    .map((row) => {
      const tenant = nameToTenant.get(row.tenant)!
      return {
        tenantId: tenant.id,
        propertyId: tenant.propertyId,
        salesDate: row.date,
        grossSales: row.gross,
        netSales: row.net,
        refunds: row.refunds || "0",
        discounts: row.discounts || "0",
        transactionCount: row.transactions ? parseInt(row.transactions) : 0,
        source: "manual_upload" as const,
      }
    })

  if (values.length > 0) {
    await db.insert(posSalesData).values(values as any)
  }
  return values.length
}

// ── Main Processor ───────────────────────────────────────────────────────────

const BATCH_SIZE = 100

export async function processImport(jobId: string, csvText: string) {
  // 1. Load job
  const job = await db.query.importJobs.findFirst({
    where: eq(importJobs.id, jobId),
  })

  if (!job) throw new Error("Import job not found")

  const importType = job.type as ImportType

  // 2. Mark processing
  await db
    .update(importJobs)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(importJobs.id, jobId))

  // 3. Parse CSV
  const { headers, rows } = parseCSV(csvText)

  // Validate headers
  const headerError = validateHeaders(importType, headers)
  if (headerError) {
    await db
      .update(importJobs)
      .set({
        status: "failed",
        errorLog: [{ row: 0, data: {}, error: headerError }],
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId))
    return
  }

  // 4. Update total
  await db
    .update(importJobs)
    .set({ totalRows: rows.length, updatedAt: new Date() })
    .where(eq(importJobs.id, jobId))

  const errors: RowError[] = []
  const validate = VALIDATORS[importType]
  let processed = 0

  // 5. Process in batches
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    // Validate each row
    const validRows: Record<string, string>[] = []
    batch.forEach((row, batchIdx) => {
      const rowNum = i + batchIdx + 2 // +2: 1-indexed, skip header
      const err = validate(row)
      if (err) {
        errors.push({ row: rowNum, data: row, error: err })
      } else {
        validRows.push(row)
      }
    })

    // Insert valid rows
    if (validRows.length > 0) {
      try {
        switch (importType) {
          case "tenants":
            await insertTenants(validRows, job.organizationId)
            break
          case "leases":
            await insertLeases(validRows, job.organizationId)
            break
          case "vendors":
            await insertVendors(validRows)
            break
          case "sales":
            await insertSales(validRows, job.organizationId)
            break
        }
      } catch (err) {
        // If batch fails, log each row as error
        validRows.forEach((row, idx) => {
          errors.push({
            row: i + idx + 2,
            data: row,
            error: err instanceof Error ? err.message : "Insert failed",
          })
        })
      }
    }

    processed += batch.length

    // 6. Update progress
    await db
      .update(importJobs)
      .set({
        processedRows: processed,
        errorRows: errors.length,
        errorLog: errors,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, jobId))
  }

  // 7. Final status
  await db
    .update(importJobs)
    .set({
      status: errors.length === rows.length ? "failed" : "completed",
      processedRows: rows.length,
      errorRows: errors.length,
      errorLog: errors,
      updatedAt: new Date(),
    })
    .where(eq(importJobs.id, jobId))
}

// ── CSV Templates ────────────────────────────────────────────────────────────

export const CSV_TEMPLATES: Record<ImportType, string> = {
  tenants: "name,email,property,unit,area_sqft\nAcme Store,acme@example.com,MALL-01,G-12,1200",
  leases: "tenant,start_date,end_date,unit,area_sqft,rent,mg,rev_share\nAcme Store,2025-01-01,2027-12-31,G-12,1200,50000,45000,8",
  vendors: "name,category,contact,email,phone\nCleanCo,cleaning,John Doe,clean@example.com,9876543210",
  sales: "tenant,date,gross,net,method,transactions\nAcme Store,2025-03-15,125000,118750,card,42",
}
