/* global describe it */
const { ShitcoinCurrencyPluginFactory } = require('../lib/indexShitcoin.js')
const assert = require('assert')

const io = {
  random (size) {
    const out = []
    for (let i = 0; i < size; i++) {
      const rand = (((i + 23) * 38239875) / (i + 481)) % 255
      out.push(rand)
    }
    return out
  },
  console: {
    info: console.log,
    warn: console.log,
    error: console.log
  }
}

function makePlugin () {
  return ShitcoinCurrencyPluginFactory.makePlugin({io})
}

function makeEngine () {
  return new Promise((resolve, reject) => {
    makePlugin().then((plugin) => {
      const type = 'wallet:shitcoin'
      const keys = plugin.createPrivateKey(type)
      const walletInfo = {
        type,
        keys
      }
      const publicKeys = plugin.derivePublicKey(walletInfo)
      const keys2 = Object.assign({}, walletInfo.keys, publicKeys)
      walletInfo.keys = keys2
      const engine = plugin.makeEngine(walletInfo)
      resolve(engine)
    }).catch(error => {
      reject(error)
    })
  })
}

describe('Plugin', function () {
  it('Get currency info', function () {
    makePlugin().then((plugin) => {
      assert.equal(plugin.currencyInfo.currencyCode, 'TRD')
    })
  })
})

describe('createPrivateKey', function () {
  it('Create valid key', function () {
    makePlugin().then((plugin) => {
      const privateKeys = plugin.createPrivateKey('wallet:shitcoin')
      assert.equal(!privateKeys, false)
      assert.equal(typeof privateKeys.masterPrivateKey, 'string')
      assert.equal(privateKeys.masterPrivateKey, 'A7E6EAB74DAFDEDD')
    })
  })
})

describe('derivePublicKey', function () {
  it('Valid private key', function () {
    makePlugin().then((plugin) => {
      const walletInfoprivate = {
        type: 'shitcoin',
        keys: {'masterPrivateKey': '12345abcde'}
      }
      const publicKeys = plugin.derivePublicKey(walletInfoprivate)
      assert.equal(publicKeys.masterPublicKey.toLowerCase(), 'pub12345abcde'.toLowerCase())
    })
  })

  it('Invalid key name', function () {
    makePlugin().then((plugin) => {
      assert.throws(() => {
        plugin.derivePublicKey({
          type: 'shitcoin',
          keys: {'masterPrivateKeyz': '12345abcde'}
        })
      })
    })
  })

  it('Invalid wallet type', function () {
    makePlugin().then((plugin) => {
      assert.throws(() => {
        plugin.derivePublicKey({
          type: 'shitcoinz',
          keys: {'masterPrivateKey': '12345abcde'}
        })
      })
    })
  })
})

describe('parseUri', function () {
  it('address only', function () {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, null)
      assert.equal(parsedUri.currencyCode, null)
    })
  })
  it('uri address', function () {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, null)
      assert.equal(parsedUri.currencyCode, null)
    })
  })
  it('uri address with amount', function () {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=12345.6789')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, '123456789')
      assert.equal(parsedUri.currencyCode, 'TRD')
    })
  })
  it('uri address with amount & label', function () {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678&label=Johnny%20Bitcoin')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, '12345678')
      assert.equal(parsedUri.currencyCode, 'TRD')
      assert.equal(parsedUri.label, 'Johnny Bitcoin')
    })
  })
  it('uri address with amount, label & message', function () {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678&label=Johnny%20Bitcoin&message=Hello%20World,%20I%20miss%20you%20!')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, '12345678')
      assert.equal(parsedUri.currencyCode, 'TRD')
      assert.equal(parsedUri.label, 'Johnny Bitcoin')
      assert.equal(parsedUri.message, 'Hello World, I miss you !')
    })
  })
  it('uri address with unsupported param', function () {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?unsupported=helloworld&amount=12345.6789')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, '123456789')
      assert.equal(parsedUri.currencyCode, 'TRD')
    })
  })
})

describe('encodeUri', function () {
  it('address only', function () {
    makePlugin().then((plugin) => {
      const encodedUri = plugin.encodeUri({publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8'})
      assert.equal(encodedUri, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
    })
  })
  it('address & amount', function () {
    makePlugin().then((plugin) => {
      const encodedUri = plugin.encodeUri(
        {
          publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
          nativeAmount: '12345678'
        }
      )
      assert.equal(encodedUri, 'shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678')
    })
  })
  it('address, amount, and label', function () {
    makePlugin().then((plugin) => {
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
  })
  it('address, amount, label, & message', function () {
    makePlugin().then((plugin) => {
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
  })
  it('invalid currencyCode', function () {
    makePlugin().then((plugin) => {
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
})

describe('Engine', function () {
  it('startEngine exists', function () {
    makeEngine().then(engine => {
      assert.equal(typeof engine.startEngine, 'function')
    })
  })
  it('Make spend', function () {
    makeEngine().then(engine => {
      assert.equal(typeof engine.killEngine, 'function')
    })
  })
})
