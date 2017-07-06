import { txLibInfo } from './txLibInfo.js'
import { ABCTxLibTRD } from './abcWalletTxLib-TRD.js'
import { base16 } from 'rfc4648'

export class ShitcoinCurrencyPlugin {
  constructor (io) {
    this.io = io
  }

  get currencyInfo () {
    return txLibInfo.getInfo
  }

  getInfo () {
    return txLibInfo.getInfo
  }

  createMasterKeys (walletType) {
    if (walletType === 'shitcoin') {
      const masterPrivateKey = base16.stringify(this.io.random(8))
      const masterPublicKey = 'pub' + masterPrivateKey
      return { masterPrivateKey, masterPublicKey }
    } else {
      return null
    }
  }

  makeEngine (keyInfo, opts = {}) {
    const engine = new ABCTxLibTRD(this.io, keyInfo, opts)
    return engine
  }
}
