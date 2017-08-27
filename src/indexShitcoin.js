/** Created by Paul Puey 7/7/17 */
// @flow

import { base16 } from 'rfc4648'
import { txLibInfo } from './currencyInfoTRD.js'
import { ShitcoinEngine } from './currencyEngineTRD.js'
import type {
  EsParsedUri,
  EsEncodeUri,
  EsCurrencyPlugin,
  EsWalletInfo,
  EsMakeCurrencyPlugin
} from 'airbitz-core-js'
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

export const makeShitcoinPlugin:EsMakeCurrencyPlugin = (opts:any): Promise<EsCurrencyPlugin> => {
  io = opts.io

  const plugin:EsCurrencyPlugin = {
    pluginName: 'shitcoin',
    currencyInfo: txLibInfo.currencyInfo,

    createPrivateKey: (walletType: string) => {
      const type = walletType.replace('wallet:', '')

      if (type === 'shitcoin') {
        const masterPrivateKey = base16.stringify(io.random(8))
        return { masterPrivateKey }
      } else {
        throw new Error('InvalidWalletType')
      }
    },

    derivePublicKey: (walletInfo: EsWalletInfo) => {
      const type = walletInfo.type.replace('wallet:', '')
      if (type === 'shitcoin') {
        if (typeof walletInfo.keys.masterPrivateKey !== 'string') {
          throw new Error('InvalidKeyName')
        }
        const masterPublicKey = 'pub' + walletInfo.keys.masterPrivateKey
        return { masterPublicKey }
      } else {
        throw new Error('InvalidWalletType')
      }
    },

    // XXX Deprecated. To be removed once Core supports createPrivateKey and derivePublicKey -paulvp
    createMasterKeys: function (walletType:string) {
      const type = walletType.replace('wallet:', '')
      if (type === 'shitcoin') {
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

      const esParsedUri:EsParsedUri = {
        publicAddress: address
      }
      if (nativeAmount) {
        esParsedUri.nativeAmount = nativeAmount
      }
      if (currencyCode) {
        esParsedUri.currencyCode = currencyCode
      }
      if (label) {
        esParsedUri.label = label
      }
      if (message) {
        esParsedUri.message = message
      }

      return esParsedUri
    },

    encodeUri: (obj: EsEncodeUri) => {
      if (!obj.publicAddress) {
        throw new Error('InvalidPublicAddressError')
      }
      if (!obj.nativeAmount && !obj.label && !obj.message) {
        return obj.publicAddress
      } else {
        let queryString: string = ''

        if (typeof obj.nativeAmount === 'string') {
          let currencyCode: string = 'TRD'
          let nativeAmount:string = obj.nativeAmount
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
        if (typeof obj.label === 'string') {
          queryString += 'label=' + obj.label + '&'
        }
        if (typeof obj.message === 'string') {
          queryString += 'message=' + obj.message + '&'
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
  async function helperfunc (opts:any) {
    return plugin
  }
  return helperfunc(opts)
}
