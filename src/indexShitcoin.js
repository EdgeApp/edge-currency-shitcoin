/** Created by Paul Puey 7/7/17 */
// @flow

import { base16 } from 'rfc4648'
import { txLibInfo } from './currencyInfoTRD.js'
import { ShitcoinEngine } from './currencyEngineTRD.js'
import { parse, serialize } from 'uri-js'
import { bns } from 'biggystring'

let io

function getDenomInfo (denom:string) {
  return txLibInfo.getInfo.denominations.find(element => {
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

class ABCParsedURI {
  publicAddress:string
  nativeAmount:string|null
  currencyCode:string|null
  label:string|null
  message:string|null

  constructor (
    publicAddress:string,
    nativeAmount:string|null,
    currencyCode:string|null,
    label:string|null,
    message:string|null
  ) {
    this.publicAddress = publicAddress
    this.nativeAmount = nativeAmount
    this.currencyCode = currencyCode
    this.label = label
    this.message = message
  }
}

class ShitcoinPlugin {
  static async makePlugin (opts:any) {
    io = opts.io

    return {
      currencyInfo: txLibInfo.getInfo,

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
          let multiplier: string | number = getDenomInfo('TRD').multiplier
          if (typeof multiplier !== 'string') {
            multiplier = multiplier.toString()
          }
          nativeAmount = bns.mulf(amount, multiplier)
          currencyCode = 'TRD'
        }
        label = getParameterByName('label', uri)
        message = getParameterByName('message', uri)

        return new ABCParsedURI(address, nativeAmount, currencyCode, label, message)
      },

      encodeUri: (obj: any) => {
        if (!obj.publicAddress) {
          throw new Error('InvalidPublicAddressError')
        }
        if (!obj.nativeAmount && !obj.label && !obj.message) {
          return obj.publicAddress
        } else {
          let queryString: string = ''

          if (obj.nativeAmount) {
            let currencyCode: string = 'ETH'
            if (typeof obj.currencyCode === 'string') {
              currencyCode = obj.currencyCode
            }
            let multiplier: string | number = getDenomInfo(currencyCode).multiplier
            if (typeof multiplier !== 'string') {
              multiplier = multiplier.toString()
            }
            let amount = bns.divf(obj.nativeAmount, multiplier)

            queryString += 'amount=' + amount.toString() + '&'
          }
          if (obj.label) {
            queryString += 'label=' + obj.label + '&'
          }
          if (obj.message) {
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
  }
}

export { ShitcoinPlugin }
