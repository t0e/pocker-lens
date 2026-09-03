import { FastifyPluginAsync } from 'fastify'
import {
  ExchangeRateQuerySchema,
  SetReportingCurrencySchema,
  SUPPORTED_CURRENCIES,
} from '@pocketlens/shared'
import { prisma } from '../db/client.js'
import { fxService } from '../services/fx.js'

export const fxRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate)

  // GET /fx/rates
  fastify.get('/fx/rates', async (request, reply) => {
    const parseResult = ExchangeRateQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message:
          parseResult.error.errors[0]?.message || 'Invalid FX query parameters',
      })
    }

    const { baseCurrency, quoteCurrency, date } = parseResult.data
    const rateInfo = await fxService.getExchangeRate(
      baseCurrency,
      quoteCurrency,
      date,
    )

    if (!rateInfo) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Exchange rate for ${baseCurrency}/${quoteCurrency} is not available`,
      })
    }

    return reply.send({
      baseCurrency: baseCurrency.toUpperCase(),
      quoteCurrency: quoteCurrency.toUpperCase(),
      rate: rateInfo.rate,
      rateDate: rateInfo.rateDate,
    })
  })

  // GET /fx/reporting-currency
  fastify.get('/fx/reporting-currency', async (request, reply) => {
    const userId = request.user.id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { reportingCurrency: true },
    })

    return reply.send({
      reportingCurrency: user?.reportingCurrency || 'VND',
    })
  })

  // POST /fx/reporting-currency
  fastify.post('/fx/reporting-currency', async (request, reply) => {
    const parseResult = SetReportingCurrencySchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message:
          parseResult.error.errors[0]?.message ||
          'Invalid reporting currency input',
      })
    }

    const { reportingCurrency } = parseResult.data
    const code = reportingCurrency.toUpperCase()
    const isSupported = SUPPORTED_CURRENCIES.some((c) => c.code === code)

    if (!isSupported) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Unsupported currency code: ${code}`,
      })
    }

    const userId = request.user.id
    await prisma.user.update({
      where: { id: userId },
      data: { reportingCurrency: code },
    })

    return reply.send({
      reportingCurrency: code,
      message: 'Reporting currency updated successfully',
    })
  })
}
