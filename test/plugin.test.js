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

// function makeEngine () {
//   return new Promise((resolve, reject) => {
//     makePlugin().then((plugin) => {
//       const type = 'wallet:shitcoin'
//       const keys = plugin.createPrivateKey(type)
//       const walletInfo = {
//         type,
//         keys
//       }
//       const publicKeys = plugin.derivePublicKey(walletInfo)
//       const keys2 = Object.assign({}, walletInfo.keys, publicKeys)
//       walletInfo.keys = keys2
//       const engine = plugin.makeEngine(walletInfo)
//       resolve(engine)
//     }).catch(error => {
//       reject(error)
//     })
//   })
// }

describe('Plugin', function () {
  it('Get currency info', function (done) {
    makePlugin().then((plugin) => {
      assert.equal(plugin.currencyInfo.currencyCode, 'TRD')
      done()
    })
  })
})

describe('createPrivateKey', function () {
  it('Create valid key', function (done) {
    makePlugin().then((plugin) => {
      const privateKeys = plugin.createPrivateKey('wallet:shitcoin')
      assert.equal(!privateKeys, false)
      assert.equal(typeof privateKeys.masterPrivateKey, 'string')
      assert.equal(privateKeys.masterPrivateKey, 'tprivA7E6EAB74DAFDEDD')
      done()
    })
  })
})

describe('derivePublicKey', function () {
  it('Valid private key', function (done) {
    makePlugin().then((plugin) => {
      const walletInfoprivate = {
        type: 'shitcoin',
        keys: {'masterPrivateKey': 'tpriv12345abcde'}
      }
      const publicKeys = plugin.derivePublicKey(walletInfoprivate)
      assert.equal(publicKeys.masterPublicKey.toLowerCase(), 'tpub12345abcde'.toLowerCase())
      done()
    })
  })

  it('Invalid key name', function (done) {
    makePlugin().then((plugin) => {
      assert.throws(() => {
        plugin.derivePublicKey({
          type: 'shitcoin',
          keys: {'masterPrivateKeyz': 'tpriv12345abcde'}
        })
      })
      done()
    })
  })

  it('Invalid private key', function (done) {
    makePlugin().then((plugin) => {
      assert.throws(() => {
        plugin.derivePublicKey({
          type: 'shitcoin',
          keys: {'masterPrivateKey': 'tp12345abcde'}
        })
      })
      done()
    })
  })

  it('Invalid wallet type', function (done) {
    makePlugin().then((plugin) => {
      assert.throws(() => {
        plugin.derivePublicKey({
          type: 'shitcoinz',
          keys: {'masterPrivateKey': '12345abcde'}
        })
      })
      done()
    })
  })
})

describe('parseUri', function () {
  it('address only', function (done) {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, null)
      assert.equal(parsedUri.currencyCode, null)
      done()
    })
  })
  it('uri address', function (done) {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, null)
      assert.equal(parsedUri.currencyCode, null)
      done()
    })
  })
  it('uri address with amount', function (done) {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=12345.6789')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, '123456789')
      assert.equal(parsedUri.currencyCode, 'TRD')
      done()
    })
  })
  it('uri address with amount & label', function (done) {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678&label=Johnny%20Bitcoin')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, '12345678')
      assert.equal(parsedUri.currencyCode, 'TRD')
      assert.equal(parsedUri.metadata.name, 'Johnny Bitcoin')
      done()
    })
  })
  it('uri address with amount, label & message', function (done) {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678&label=Johnny%20Bitcoin&message=Hello%20World,%20I%20miss%20you%20!')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, '12345678')
      assert.equal(parsedUri.currencyCode, 'TRD')
      assert.equal(parsedUri.metadata.name, 'Johnny Bitcoin')
      assert.equal(parsedUri.metadata.message, 'Hello World, I miss you !')
      done()
    })
  })
  it('uri address with unsupported param', function (done) {
    makePlugin().then((plugin) => {
      const parsedUri = plugin.parseUri('shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?unsupported=helloworld&amount=12345.6789')
      assert.equal(parsedUri.publicAddress, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      assert.equal(parsedUri.nativeAmount, '123456789')
      assert.equal(parsedUri.currencyCode, 'TRD')
      done()
    })
  })
})

describe('encodeUri', function () {
  it('address only', function (done) {
    makePlugin().then((plugin) => {
      const encodedUri = plugin.encodeUri({publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8'})
      assert.equal(encodedUri, '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8')
      done()
    })
  })
  it('address & amount', function (done) {
    makePlugin().then((plugin) => {
      const encodedUri = plugin.encodeUri(
        {
          publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
          nativeAmount: '12345678'
        }
      )
      assert.equal(encodedUri, 'shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678')
      done()
    })
  })
  it('address, amount, and label', function (done) {
    makePlugin().then((plugin) => {
      const encodedUri = plugin.encodeUri(
        {
          publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
          nativeAmount: '12345678',
          currencyCode: 'TRD',
          metadata: {
            name: 'Johnny Bitcoin'
          }
        }
      )
      assert.equal(encodedUri, 'shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678&label=Johnny%20Bitcoin')
      done()
    })
  })
  it('address, amount, label, & message', function (done) {
    makePlugin().then((plugin) => {
      const encodedUri = plugin.encodeUri(
        {
          publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
          nativeAmount: '12345678',
          currencyCode: 'TRD',
          metadata: {
            name: 'Johnny Bitcoin',
            message: 'Hello World, I miss you !'
          }
        }
      )
      assert.equal(encodedUri, 'shitcoin:0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8?amount=1234.5678&label=Johnny%20Bitcoin&message=Hello%20World,%20I%20miss%20you%20!')
      done()
    })
  })
  it('invalid currencyCode', function (done) {
    makePlugin().then((plugin) => {
      assert.throws(() => {
        plugin.encodeUri(
          {
            publicAddress: '0xEA674fdDe714fd979de3EdF0F56AA9716B898ec8',
            nativeAmount: '12345678',
            currencyCode: 'INVALID',
            name: 'Johnny Bitcoin',
            message: 'Hello World, I miss you !'
          }
        )
      })
      done()
    })
  })
})

// describe('Engine', function () {
//   it('startEngine exists', function () {
//     makeEngine().then(engine => {
//       assert.equal(typeof engine.startEngine, 'function')
//     })
//   })
//   it('Make spend', function () {
//     makeEngine().then(engine => {
//       assert.equal(typeof engine.killEngine, 'function')
//     })
//   })
// })
