/* global describe it */
const { ShitcoinPlugin } = require('../lib/indexShitcoin.js')
const assert = require('assert')

const io = {
  random (size) {
    return new Array(size)
  }
}

let plugin

describe('Plugin', function () {
  it('Get currency info', function () {
    ShitcoinPlugin.makePlugin(io).then((shitcoinPlugin) => {
      assert.equal(shitcoinPlugin.currencyInfo.currencyCode, 'TRD')
      plugin = shitcoinPlugin
    })
  })
})

describe('derivePublicKey', function () {
  it('Valid private key', function () {
    const walletInfo = plugin.derivePublicKey({
      type: 'shitcoin',
      keys: {'masterPrivateKey': '12345678abcd'}
    })
    assert.equal(walletInfo.keys.masterPublicKey.toLowerCase(), 'pub12345678abcd'.toLowerCase())
  })

  it('Invalid key name', function () {
    assert.throws(() => {
      plugin.derivePublicKey({
        type: 'shitcoin',
        keys: {'masterPrivateKeyz': '12345678abcd'}
      })
    })
  })

  it('Invalid wallet type', function () {
    assert.throws(() => {
      plugin.derivePublicKey({
        type: 'shitzcoin',
        keys: {'masterPrivateKey': '12345678abcd'}
      })
    })
  })
})

describe('parseUri', function () {
  it('address only', function () {
    const parsedUri = plugin.parseUri('0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
    assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
    assert.equal(parsedUri.nativeAmount, null)
    assert.equal(parsedUri.currencyCode, null)
  })
  it('uri address', function () {
    const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
    assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
    assert.equal(parsedUri.nativeAmount, null)
    assert.equal(parsedUri.currencyCode, null)
  })
  it('uri address with amount', function () {
    const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=12345.6789')
    assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
    assert.equal(parsedUri.nativeAmount, '123456789')
    assert.equal(parsedUri.currencyCode, 'TRD')
  })
  it('uri address with amount & label', function () {
    const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678&label=Johnny%20Bitcoin')
    assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
    assert.equal(parsedUri.nativeAmount, '12345678')
    assert.equal(parsedUri.currencyCode, 'TRD')
    assert.equal(parsedUri.label, 'Johnny Bitcoin')
  })
  it('uri address with amount, label & message', function () {
    const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678&label=Johnny%20Bitcoin&message=Hello%20World,%20I%20miss%20you%20!')
    assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
    assert.equal(parsedUri.nativeAmount, '12345678')
    assert.equal(parsedUri.currencyCode, 'TRD')
    assert.equal(parsedUri.label, 'Johnny Bitcoin')
    assert.equal(parsedUri.message, 'Hello World, I miss you !')
  })
  it('uri address with unsupported param', function () {
    const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?unsupported=helloworld&amount=12345.6789')
    assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
    assert.equal(parsedUri.nativeAmount, '123456789')
    assert.equal(parsedUri.currencyCode, 'TRD')
  })
})

describe('encodeUri', function () {
  it('address only', function () {
    const encodedUri = plugin.encodeUri({publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8'})
    assert.equal(encodedUri, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
  })
  it('address & amount', function () {
    const encodedUri = plugin.encodeUri(
      {
        publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
        nativeAmount: '12345678'
      }
    )
    assert.equal(encodedUri, 'shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678')
  })
  it('address, amount, and label', function () {
    const encodedUri = plugin.encodeUri(
      {
        publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
        nativeAmount: '12345678',
        currencyCode: 'TRD',
        label: 'Johnny Bitcoin'
      }
    )
    assert.equal(encodedUri, 'shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678&label=Johnny%20Bitcoin')
  })
  it('address, amount, label, & message', function () {
    const encodedUri = plugin.encodeUri(
      {
        publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
        nativeAmount: '12345678',
        currencyCode: 'TRD',
        label: 'Johnny Bitcoin',
        message: 'Hello World, I miss you !'
      }
    )
    assert.equal(encodedUri, 'shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678&label=Johnny%20Bitcoin&message=Hello%20World,%20I%20miss%20you%20!')
  })
  it('invalid currencyCode', function () {
    assert.throws(() => {
      plugin.encodeUri(
        {
          publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
          nativeAmount: '12345678',
          currencyCode: 'INVALID',
          label: 'Johnny Bitcoin',
          message: 'Hello World, I miss you !'
        }
      )
    })
  })
})
