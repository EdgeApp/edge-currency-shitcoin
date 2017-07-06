export class ShitcoinExchangePlugin {
  constructor (io) {
    this.io = io
  }

  get exchangeInfo () {
    return {
      exchangeName: 'Shitcoin Virtual Exchange'
    }
  }

  fetchExchangeRates (pairs) {
    const rate = 2 + Math.sin(Math.PI * Date.now() / (10 * 60 * 1000))
    return Promise.resolve([
      { fromCurrency: 'TRD', toCurrency: 'iso:USD', rate },
      { fromCurrency: 'ANA', toCurrency: 'iso:USD', rate: rate / 4 },
      { fromCurrency: 'DOGESHIT', toCurrency: 'iso:USD', rate: rate / 2 },
      { fromCurrency: 'HOLYSHIT', toCurrency: 'iso:USD', rate: rate * 2 }
    ])
  }
}
