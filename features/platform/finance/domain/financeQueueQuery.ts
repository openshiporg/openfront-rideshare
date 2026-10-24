export const financeQueueQuery = `query FinanceQueue($where: PaymentWhereInput!, $take: Int!, $skip: Int!) {
  financeQueueScope
  payments(where: $where, orderBy: [{ createdAt: desc }, { id: desc }], take: $take, skip: $skip) {
    id status amountMinor currencyCode createdAt refundsCount trip { id confirmationCode }
  }
  paymentsCount(where: $where)
}`
