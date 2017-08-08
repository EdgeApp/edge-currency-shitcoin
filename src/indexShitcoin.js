/** Created by Paul Puey 7/7/17 */
// @flow

import { base16 } from 'rfc4648'
import { currencyInfoTRD } from './currencyInfoTRD.js'
import { ShitcoinEngine } from './currencyEngineTRD.js'

let io

class ShitcoinPlugin {
  static async makePlugin (opts:any) {
    io = opts.io

    return {
      currencyInfo: currencyInfoTRD.getInfo,

      createMasterKeys: function (walletType:string) {
        if (walletType === 'shitcoin') {
          const masterPrivateKey = base16.stringify(io.random(8))
          const masterPublicKey = 'pub' + masterPrivateKey
          return { masterPrivateKey, masterPublicKey }
        } else {
          return null
        }
      },

      makeEngine: function (keyInfo:any, opts:any = {}) {
        const engine = new ShitcoinEngine(io, keyInfo, opts)
        return engine
      }
    }
  }
}

export { ShitcoinPlugin }
