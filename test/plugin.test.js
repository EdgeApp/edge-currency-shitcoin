/* global describe it */
const { ShitcoinPlugin } = require('../lib/abc-shitcoin')
const assert = require('assert')

const io = {
  random (size) {
    return new Array(size)
  }
}

describe('Plugin', function () {
  it('Get currency info', function () {
    ShitcoinPlugin.makePlugin(io).then((shitcoinPlugin) => {
      assert.equal(shitcoinPlugin.getInfo().currencyCode, 'TRD')
    })
  })

  // it('Get exchange info', function () {
  //   return makeShitcoinExchangePlugin(io).then(plugin => {
  //     assert.equal(
  //       plugin.exchangeInfo.exchangeName,
  //       'Shitcoin Virtual Exchange'
  //     )
  //     return plugin.fetchExchangeRates([]).then(pairs => {
  //       assert.equal(pairs.length, 4)
  //       return null
  //     })
  //   })
  // })
})
