/* global describe it */
const { shitcoinCurrencyPlugin, shitcoinExchangePlugin } = require('../lib')
const assert = require('assert')

const io = {
  random (size) {
    return new Array(size)
  }
}

describe('Plugin', function () {
  it('Get currency info', function () {
    return shitcoinCurrencyPlugin
      .makePlugin(io)
      .then(plugin => assert.equal(plugin.currencyInfo.currencyCode, 'TRD'))
  })

  it('Get exchange info', function () {
    return shitcoinExchangePlugin.makePlugin(io).then(plugin => {
      assert.equal(
        plugin.exchangeInfo.exchangeName,
        'Shitcoin Virtual Exchange'
      )
      return plugin.fetchExchangeRates([]).then(pairs => {
        assert.equal(pairs.length, 4)
        return null
      })
    })
  })
})
