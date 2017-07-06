import { ShitcoinCurrencyPlugin } from './currencyPlugin.js'
import { ShitcoinExchangePlugin } from './exchangePlugin.js'

export const shitcoinCurrencyPlugin = {
  pluginType: 'currency',

  makePlugin (io) {
    return Promise.resolve(new ShitcoinCurrencyPlugin(io))
  }
}

export const shitcoinExchangePlugin = {
  pluginType: 'exchange',

  makePlugin (io) {
    return Promise.resolve(new ShitcoinExchangePlugin(io))
  }
}

/**
 * Creates the shitcoin plugin instance.
 * Expects a single option, which is the core io object.
 */
export function makeShitcoinPlugin (opts = {}) {
  const plugin = new ShitcoinCurrencyPlugin(opts.io)
  return plugin
}
