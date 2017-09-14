/** Created by Paul Puey 7/7/17 */
// @flow

import { base16 } from 'rfc4648'
import { txLibInfo } from './currencyInfoTRD.js'
import { ShitcoinEngine, WalletLocalData, DATA_STORE_FOLDER, DATA_STORE_FILE } from './currencyEngineTRD.js'
import type {
  AbcParsedUri,
  AbcEncodeUri,
  AbcCurrencyPlugin,
  AbcWalletInfo,
  AbcCurrencyPluginFactory
} from 'airbitz-core-types'
import { parse, serialize } from 'uri-js'
import { bns } from 'biggystring'

let io

function getDenomInfo (denom:string) {
  return txLibInfo.currencyInfo.denominations.find(element => {
    return element.name === denom
  })
}

function getParameterByName (param, url) {
  const name = param.replace(/[[\]]/g, '\\$&')
  const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)')
  const results = regex.exec(url)
  if (!results) return null
  if (!results[2]) return ''
  return decodeURIComponent(results[2].replace(/\+/g, ' '))
}

export const ShitcoinCurrencyPluginFactory: AbcCurrencyPluginFactory = {
  pluginType: 'currency',

  async makePlugin (opts:any):Promise<AbcCurrencyPlugin> {
    io = opts.io

    const shitcoinPlugin: AbcCurrencyPlugin = {
      pluginName: 'shitcoin',
      currencyInfo: txLibInfo.currencyInfo,

      createPrivateKey: (walletType: string) => {
        const type = walletType.replace('wallet:', '')

        if (type === 'shitcoin') {
          const masterPrivateKey = 'tpriv' + base16.stringify(io.random(8))
          return { masterPrivateKey }
        } else {
          throw new Error('InvalidWalletType')
        }
      },

      derivePublicKey: (walletInfo: AbcWalletInfo) => {
        const type = walletInfo.type.replace('wallet:', '')
        if (type === 'shitcoin') {
          if (typeof walletInfo.keys.masterPrivateKey !== 'string') {
            throw new Error('InvalidKeyName')
          }
          if (typeof walletInfo.keys.masterPrivateKey === 'string') {
            if (walletInfo.keys.masterPrivateKey.startsWith('tpriv')) {
              const masterPublicKey = walletInfo.keys.masterPrivateKey.replace('tpriv', 'tpub')
              return { masterPublicKey }
            }
            throw new Error('InvalidPrivateKey')
          }
          throw new Error('InvalidKeyName')
        } else {
          throw new Error('InvalidWalletType')
        }
      },

      async makeEngine (walletInfo: AbcWalletInfo, opts: any = {}):any {
        const engine = new ShitcoinEngine(io, walletInfo, opts)
        let newData = false
        if (opts.resetData === 'true') {
          newData = true
        }

        let result = ''
        if (!newData) {
          try {
            result =
              await engine.walletLocalFolder
                .folder(DATA_STORE_FOLDER)
                .file(DATA_STORE_FILE)
                .getText(DATA_STORE_FOLDER, 'walletLocalData')
          } catch (err) {
            io.console.info(err)
            io.console.info('No walletLocalData setup yet: Failure is ok')
            newData = true
          }
        }

        if (newData) {
          engine.walletLocalData = new WalletLocalData(null)
        } else {
          engine.walletLocalData = new WalletLocalData(result)
        }
        engine.walletLocalData.masterPublicKey = engine.walletInfo.keys.masterPublicKey

        if (newData) {
          try {
            await engine.walletLocalFolder
              .folder(DATA_STORE_FOLDER)
              .file(DATA_STORE_FILE)
              .setText(JSON.stringify(engine.walletLocalData))
          } catch (err) {
            io.console.error('Error writing to localDataStore. Engine not started:' + err)
            return
          }
        }

        return engine
      },
      parseUri: (uri: string) => {
        const parsedUri = parse(uri)
        let address: string
        let amount: number = 0
        let nativeAmount: string | null = null
        let currencyCode: string | null = null
        let label
        let message

        if (
          typeof parsedUri.scheme !== 'undefined' &&
          parsedUri.scheme !== 'shitcoin'
        ) {
          throw new Error('InvalidUriError')
        }
        if (typeof parsedUri.host !== 'undefined') {
          address = parsedUri.host
        } else if (typeof parsedUri.path !== 'undefined') {
          address = parsedUri.path
        } else {
          throw new Error('InvalidUriError')
        }
        address = address.replace('/', '') // Remove any slashes
        const amountStr = getParameterByName('amount', uri)
        if (amountStr && typeof amountStr === 'string') {
          amount = parseFloat(amountStr)
          const denom = getDenomInfo('TRD')
          if (!denom) {
            throw new Error('InternalErrorInvalidCurrencyCode')
          }
          let multiplier: string | number = denom.multiplier
          if (typeof multiplier !== 'string') {
            multiplier = multiplier.toString()
          }
          nativeAmount = bns.mulf(amount, multiplier)
          currencyCode = 'TRD'
        }
        label = getParameterByName('label', uri)
        message = getParameterByName('message', uri)

        const abcParsedUri: AbcParsedUri = {
          publicAddress: address
        }
        if (nativeAmount) {
          abcParsedUri.nativeAmount = nativeAmount
        }
        if (currencyCode) {
          abcParsedUri.currencyCode = currencyCode
        }
        if (label || message) {
          abcParsedUri.metadata = {}
          if (label) {
            abcParsedUri.metadata.name = label
          }
          if (message) {
            abcParsedUri.metadata.message = message
          }
        }

        return abcParsedUri
      },

      encodeUri: (obj: AbcEncodeUri) => {
        if (!obj.publicAddress) {
          throw new Error('InvalidPublicAddressError')
        }
        if (!obj.nativeAmount && !obj.label && !obj.message) {
          return obj.publicAddress
        } else {
          let queryString: string = ''

          if (typeof obj.nativeAmount === 'string') {
            let currencyCode: string = 'TRD'
            let nativeAmount: string = obj.nativeAmount
            if (typeof obj.currencyCode === 'string') {
              currencyCode = obj.currencyCode
            }
            const denom = getDenomInfo(currencyCode)
            if (!denom) {
              throw new Error('InternalErrorInvalidCurrencyCode')
            }
            let amount = bns.divf(nativeAmount, denom.multiplier)

            queryString += 'amount=' + amount.toString() + '&'
          }
          if (obj.metadata && (obj.metadata.name || obj.metadata.message)) {
            if (typeof obj.metadata.name === 'string') {
              queryString += 'label=' + obj.metadata.name + '&'
            }
            if (typeof obj.metadata.message === 'string') {
              queryString += 'message=' + obj.metadata.message + '&'
            }
          }
          queryString = queryString.substr(0, queryString.length - 1)

          const serializeObj = {
            scheme: 'shitcoin',
            path: obj.publicAddress,
            query: queryString
          }
          const url = serialize(serializeObj)
          return url
        }
      }
    }

    async function initPlugin (opts:any) {
      return shitcoinPlugin
    }

    return initPlugin(opts)
  }
}
