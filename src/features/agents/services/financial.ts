// @ts-nocheck - Temporary: Schema alignment needed
import { BaseAgent } from "../orchestrator"
import { financialTools } from "../tools/financial"
import { FINANCIAL_ANALYST_SYSTEM_PROMPT } from "../prompts/financial"
import type { AgentConfig, AgentContext, AgentMessage, AgentResponse, Tool, ToolResult } from "@/types/agents"

export class FinancialAnalystAgent extends BaseAgent {
  constructor() {
    const config: AgentConfig = {
      id: "financial-analyst",
      name: "Financial Analyst",
      persona: "financial_analyst",
      description: "Specializes in financial analysis, payment predictions, and revenue optimization",
      capabilities: [
        "Payment pattern analysis",
        "Payment date prediction",
        "Financial reporting",
        "Collection management",
        "Cash flow forecasting",
      ],
      systemPrompt: FINANCIAL_ANALYST_SYSTEM_PROMPT,
      tools: financialTools,
      maxIterations: 5,
      confidenceThreshold: 0.8,
    }
    super(config)
  }

  async process(input: string, context: AgentContext): Promise<AgentResponse> {
    const startTime = Date.now()
    const observations: string[] = []
    const reasoning: string[] = []
    const toolResults: ToolResult[] = []

    observations.push(`Received financial query: "${input.substring(0, 100)}..."`)
    reasoning.push("Analyzing request to determine appropriate financial action")

    const intent = this.detectIntent(input)
    reasoning.push(`Detected intent: ${intent}`)

    try {
      let result: ToolResult | null = null
      const params = this.extractParams(input)

      switch (intent) {
        case "payment_patterns":
          result = await this.executeTool("analyze_payment_patterns", {
            monthsToAnalyze: params.months || 6,
          }, context)
          break

        case "predict_payment":
          if (params.invoiceId) {
            result = await this.executeTool("predict_payment_date", {
              invoiceId: params.invoiceId,
            }, context)
          } else {
            return {
              agentId: this.config.id,
              message: "To predict a payment date, please provide the invoice ID.",
              confidence: 0.5,
              toolsUsed: [],
              reasoning,
              observations,
              processingTime: Date.now() - startTime,
              requiresHumanApproval: false,
            }
          }
          break

        case "financial_summary":
          result = await this.executeTool("generate_financial_summary", {
            propertyId: context.propertyId,
            period: params.period || "month",
          }, context)
          break

        case "send_reminder":
          if (params.invoiceId) {
            result = await this.executeTool("send_payment_reminder", {
              invoiceId: params.invoiceId,
              reminderType: params.reminderType || "gentle",
            }, context)
          } else {
            return {
              agentId: this.config.id,
              message: "To send a payment reminder, please provide the invoice ID.",
              confidence: 0.5,
              toolsUsed: [],
              reasoning,
              observations,
              processingTime: Date.now() - startTime,
              requiresHumanApproval: false,
            }
          }
          break

        default:
          result = await this.executeTool("generate_financial_summary", {
            propertyId: context.propertyId,
            period: "month",
          }, context)
      }

      if (result) {
        toolResults.push(result)
        observations.push(`Tool execution completed: ${result.success ? "success" : "failed"}`)
      }

      const response = this.generateResponse(intent, result, input)
      reasoning.push("Generated response based on financial data")

      // Determine if human approval is needed for certain actions
      const requiresApproval = intent === "send_reminder" && result?.success

      return {
        agentId: this.config.id,
        message: response,
        confidence: result?.success ? 0.9 : 0.5,
        toolsUsed: toolResults.map((r) => ({
          name: intent,
          params,
          result: r,
        })),
        reasoning,
        observations,
        processingTime: Date.now() - startTime,
        requiresHumanApproval: requiresApproval,
      }
    } catch (error) {
      return {
        agentId: this.config.id,
        message: `I encountered an error while processing your financial request: ${error instanceof Error ? error.message : "Unknown error"}`,
        confidence: 0.3,
        toolsUsed: [],
        reasoning: [...reasoning, "Error occurred during processing"],
        observations: [...observations, `Error: ${error}`],
        processingTime: Date.now() - startTime,
        requiresHumanApproval: false,
      }
    }
  }

  private detectIntent(input: string): string {
    const lowerInput = input.toLowerCase()

    if (lowerInput.includes("pattern") || lowerInput.includes("behavior") || lowerInput.includes("history")) {
      return "payment_patterns"
    }
    if (lowerInput.includes("predict") || lowerInput.includes("when will") || lowerInput.includes("forecast")) {
      return "predict_payment"
    }
    if (lowerInput.includes("reminder") || lowerInput.includes("notify") || lowerInput.includes("alert tenant")) {
      return "send_reminder"
    }
    if (lowerInput.includes("summary") || lowerInput.includes("report") || lowerInput.includes("financial") || lowerInput.includes("revenue")) {
      return "financial_summary"
    }

    return "financial_summary"
  }

  private extractParams(input: string): Record<string, string | number> {
    const params: Record<string, string | number> = {}

    // Extract invoice ID
    const invoiceMatch = input.match(/invoice[:\s#]*([a-zA-Z0-9-]+)/i)
    if (invoiceMatch) {
      params.invoiceId = invoiceMatch[1]
    }

    // Extract period
    if (input.toLowerCase().includes("quarter")) params.period = "quarter"
    else if (input.toLowerCase().includes("year")) params.period = "year"
    else params.period = "month"

    // Extract months
    const monthsMatch = input.match(/(\d+)\s*months?/i)
    if (monthsMatch) {
      params.months = parseInt(monthsMatch[1])
    }

    // Extract reminder type
    if (input.toLowerCase().includes("urgent")) params.reminderType = "urgent"
    else if (input.toLowerCase().includes("final")) params.reminderType = "final"
    else params.reminderType = "gentle"

    return params
  }

  private generateResponse(intent: string, result: ToolResult | null, originalInput: string): string {
    if (!result || !result.success) {
      return "I was unable to retrieve the financial data at this time. Please verify the information provided and try again."
    }

    const data = result.data as Record<string, any>

    switch (intent) {
      case "payment_patterns":
        return `💰 **Payment Pattern Analysis (${data.period})**\n\n**Summary:**\n• Total Invoices: ${data.summary.totalInvoices}\n• Paid On Time: ${data.summary.paidOnTime}\n• Paid Late: ${data.summary.paidLate}\n• Currently Overdue: ${data.summary.currentlyOverdue}\n• On-Time Rate: ${data.summary.onTimePaymentRate}\n\n**Prediction:**\n• Expected Collection Rate: ${data.prediction.expectedCollectionRate}%\n• Confidence: ${data.prediction.confidence}\n\n${data.atRiskTenants?.length > 0 ? `⚠️ **At-Risk Tenants:** ${data.atRiskTenants.length} tenants with on-time rates below 70%` : "✅ No at-risk tenants identified"}`

      case "predict_payment":
        return `🔮 **Payment Prediction**\n\n**Invoice:** ${data.invoiceNumber}\n• Due Date: ${data.dueDate}\n• Predicted Payment: ${data.predictedPaymentDate}\n• Avg Days from Due: ${data.averageDaysFromDue}\n• Confidence: ${(parseFloat(data.confidence) * 100).toFixed(0)}%\n\n**Recommendation:** ${data.recommendation}\n\n_Based on ${data.basedOnInvoices} historical invoices_`

      case "financial_summary":
        return `📊 **Financial Summary (${data.period})**\n_${data.startDate} to ${data.endDate}_\n\n**Revenue:**\n• Total Billed: ₹${parseFloat(data.revenue.totalBilled).toLocaleString()}\n• Collected: ₹${parseFloat(data.revenue.totalCollected).toLocaleString()}\n• Outstanding: ₹${parseFloat(data.revenue.outstanding).toLocaleString()}\n• Collection Rate: ${data.revenue.collectionRate}%\n\n**Expenses:**\n• Total: ₹${parseFloat(data.expenses.total).toLocaleString()}\n\n**Profitability:**\n• Net Income: ₹${parseFloat(data.profitability.netIncome).toLocaleString()}\n• Margin: ${data.profitability.margin}%\n\n_Based on ${data.invoiceCount} invoices_`

      case "send_reminder":
        return `✉️ **Payment Reminder Sent**\n\n• Invoice: ${data.invoiceNumber}\n• Type: ${data.reminderType.charAt(0).toUpperCase() + data.reminderType.slice(1)}\n• Sent: ${new Date(data.sentAt).toLocaleString()}\n• Total Reminders: ${data.totalRemindersSent}\n\nThe tenant has been notified. I'll monitor for payment and update you on any response.`

      default:
        return "Here's the financial data you requested."
    }
  }

  async handleMessage(message: AgentMessage, context: AgentContext): Promise<AgentResponse> {
    return this.process(message.content, context)
  }
}

export const financialAnalystAgent = new FinancialAnalystAgent()

