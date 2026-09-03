import { describe, it, expect } from 'vitest'
import { createTransactionSchema } from './index.js'

describe('Transaction Validation Schemas', () => {
  it('validates a valid expense transaction', () => {
    const res = createTransactionSchema.safeParse({
      type: 'expense',
      accountId: 'acc_123',
      categoryId: 'cat_food',
      amount: '85000',
      description: 'Highlands Coffee',
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.type).toBe('expense')
      expect(res.data.amount).toBe('85000')
    }
  })

  it('validates a valid transfer transaction', () => {
    const res = createTransactionSchema.safeParse({
      type: 'transfer',
      accountId: 'acc_bank',
      transferAccountId: 'acc_cash',
      amount: '2000000',
      description: 'ATM Cash Withdrawal',
    })
    expect(res.success).toBe(true)
  })

  it('rejects a transfer with identical source and destination accounts', () => {
    const res = createTransactionSchema.safeParse({
      type: 'transfer',
      accountId: 'acc_bank',
      transferAccountId: 'acc_bank',
      amount: '500',
      description: 'Self Transfer',
    })
    expect(res.success).toBe(false)
  })

  it('rejects a transfer with missing destination account', () => {
    const res = createTransactionSchema.safeParse({
      type: 'transfer',
      accountId: 'acc_bank',
      amount: '500',
      description: 'Transfer',
    })
    expect(res.success).toBe(false)
  })

  it('rejects zero or negative amounts', () => {
    const zeroRes = createTransactionSchema.safeParse({
      type: 'income',
      accountId: 'acc_bank',
      amount: '0',
      description: 'Zero',
    })
    expect(zeroRes.success).toBe(false)

    const negRes = createTransactionSchema.safeParse({
      type: 'expense',
      accountId: 'acc_bank',
      amount: '-50.00',
      description: 'Negative',
    })
    expect(negRes.success).toBe(false)
  })
})
