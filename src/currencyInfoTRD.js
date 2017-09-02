/* global */
// @flow

import type { AbcCurrencyInfo, AbcCurrencySettings } from 'airbitz-core-types'
import type { ShitcoinSettings } from './trdTypes.js'

const otherSettings:ShitcoinSettings = {
  shitcoinServers: [
    'http://shitcoin-az-braz.airbitz.co:8080'
  ]
}

const defaultSettings:AbcCurrencySettings = {
  addressExplorer: 'http://shitcoin-az-braz.airbitz.co:5984/_utils/document.html?db_addresses/%s',
  transactionExplorer: 'http://shitcoin-az-braz.airbitz.co:5984/_utils/document.html?db_transactions/%s',
  denomCurrencyCode: 'mTRD',
  otherSettings
}

const currencyInfo:AbcCurrencyInfo = { // Details of supported currency
  walletTypes: [
    'wallet:shitcoin'
  ],
  currencyName: 'Shitcoin',
  currencyCode: 'TRD', // The 3 character code for the currency
  defaultSettings,

  denominations: [
    // An array of Objects of the possible denominations for this currency
    {
      name: 'TRD',
      multiplier: '10000',
      symbol: '₴'
    },
    {
      name: 'mTRD',
      multiplier: '10',
      symbol: 'm₴'
    }
  ],
  symbolImage: 'data:image/png;base64,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', // Base64 encoded png or jpg image of the currency symbol (optional)
  metaTokens: [
    // Array of objects describing the supported metatokens
    {
      currencyCode: 'ANA',
      currencyName: 'Anaconda',
      denominations: [
        {
          name: 'ANA',
          multiplier: '100'
        }
      ]
    },
    {
      currencyCode: 'DOGESHIT',
      currencyName: 'Doge Shit',
      denominations: [
        {
          name: 'DOGESHIT',
          multiplier: '100'
        }
      ]
    },
    {
      currencyCode: 'HOLYSHIT',
      currencyName: 'Holy Shit',
      denominations: [
        {
          name: 'HOLYSHIT',
          multiplier: '100'
        }
      ]
    }
  ]
}

export const txLibInfo = {
  supportedTokens: ['ANA', 'DOGESHIT', 'HOLYSHIT'],
  currencyInfo
}
