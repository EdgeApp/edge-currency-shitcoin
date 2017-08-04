/** Created by Paul Puey 7/7/17 */
// @flow

import { txLibInfo } from './txLibInfo.js'
import { validate } from 'jsonschema'
import { base16 } from 'rfc4648'
import { bns } from 'biggystring'

const GAP_LIMIT = 10
const DATA_STORE_FOLDER = 'txEngineFolder'
const DATA_STORE_FILE = 'walletLocalData.json'
const ADDRESS_POLL_MILLISECONDS = 20000
const TRANSACTION_POLL_MILLISECONDS = 3000
const BLOCKHEIGHT_POLL_MILLISECONDS = 60000
const SAVE_DATASTORE_MILLISECONDS = 10000

const PRIMARY_CURRENCY = txLibInfo.getInfo.currencyCode
const TOKEN_CODES = [PRIMARY_CURRENCY].concat(txLibInfo.supportedTokens)

const baseUrl = 'http://shitcoin-az-braz.airbitz.co:8080/api/'

let io

const snooze = ms => new Promise(resolve => setTimeout(resolve, ms))

function validateObject (object, schema) {
  const result = validate(object, schema)

  if (result.errors.length === 0) {
    return true
  } else {
    for (const n in result.errors) {
      const errMsg = result.errors[n].message
      io.console.error(errMsg)
    }
    return false
  }
}

function makePlugin (opts:any) {
  io = opts.io

  return {
    getInfo: () => {
      return txLibInfo.getInfo
    },

    createMasterKeys: (walletType:string) => {
      if (walletType === 'shitcoin') {
        const masterPrivateKey = base16.stringify(this.io.random(8))
        const masterPublicKey = 'pub' + masterPrivateKey
        return { masterPrivateKey, masterPublicKey }
      } else {
        return null
      }
    },

    makeEngine: (keyInfo:any, opts:any = {}) => {
      const engine = new ABCTxLibTRD(this.io, keyInfo, opts)
      return engine
    }
  }
}

class AddressObject {
  address:string
  txids:Array<string>|null
  amounts:{currencyCode:string}|null
  constructor (address:string, txids:Array<string>|null, amounts:any|null) {
    this.address = address
    this.txids = txids
    this.amounts = amounts
  }
}

class WalletLocalData {
  blockHeight:string
  masterPublicKey:string
  totalBalances: any
  enabledTokens:Array<string>
  gapLimitAddresses:Array<string>
  transactionsObj:{}
  transactionsToFetch:Array<string>
  addressArray:Array<AddressObject>
  unusedAddressIndex:number

  constructor (jsonString) {
    this.blockHeight = '0'
    this.totalBalances = { TRD: '0', ANA: '0', DOGESHIT: '0', HOLYSHIT: '0' }

    // Map of gap limit addresses
    this.gapLimitAddresses = []
    this.transactionsObj = {}

    // Array of ABCTransaction objects sorted by date from newest to oldest
    for (let currencyCode of TOKEN_CODES) {
      this.transactionsObj[currencyCode] = []
    }

    // Array of txids to fetch
    this.transactionsToFetch = []

    // Array of address objects, unsorted
    this.addressArray = []

    this.unusedAddressIndex = 0
    this.masterPublicKey = ''
    this.enabledTokens = [PRIMARY_CURRENCY]

    if (jsonString !== null) {
      const data = JSON.parse(jsonString)

      if (typeof data.blockHeight === 'string') this.blockHeight = data.blockHeight
      if (typeof data.masterPublicKey === 'string') this.masterPublicKey = data.masterPublicKey
      if (typeof data.totalBalances !== 'undefined') this.totalBalances = data.totalBalances
      if (typeof data.enabledTokens !== 'undefined') this.enabledTokens = data.enabledTokens
      if (typeof data.gapLimitAddresses !== 'undefined') this.gapLimitAddresses = data.gapLimitAddresses
      if (typeof data.transactionsObj !== 'undefined') this.transactionsObj = data.transactionsObj
      if (typeof data.transactionsToFetch !== 'undefined') this.transactionsToFetch = data.transactionsToFetch
      if (typeof data.addressArray !== 'undefined') this.addressArray = data.addressArray
      if (typeof data.unusedAddressIndex === 'number') this.unusedAddressIndex = data.unusedAddressIndex
    }
  }
}

class ShitcoinParams {
  inputs:any
  outputs:any

  constructor (inputs:any, outputs:any) {
    this.inputs = inputs
    this.outputs = outputs
  }
}

class ABCTransaction {
  txid:string
  date:number
  currencyCode:string
  amountSatoshi:number
  blockHeight:string
  nativeAmount:string
  networkFee:string
  signedTx:string
  otherParams:ShitcoinParams

  constructor (txid:string,
               date:number,
               currencyCode:string,
               blockHeight:string,
               nativeAmount:string,
               networkFee:string,
               signedTx:string,
               otherParams:ShitcoinParams) {
    this.txid = txid
    this.date = date
    this.currencyCode = currencyCode
    this.blockHeight = blockHeight
    this.nativeAmount = nativeAmount
    this.amountSatoshi = parseInt(nativeAmount)
    this.networkFee = networkFee
    this.signedTx = signedTx
    this.otherParams = otherParams
  }
}

export class ABCTxLibTRD {
  io:any
  keyInfo:any
  abcTxLibCallbacks:any
  walletLocalFolder:any
  engineOn:boolean
  transactionsDirty:boolean
  addressesChecked:boolean
  numAddressesChecked:number
  numAddressesToCheck:number
  walletLocalData:WalletLocalData
  walletLocalDataDirty:boolean
  transactionsChangedArray:Array<{}>

  constructor (io:any, keyInfo:any, opts:any) {
    const { walletLocalFolder, callbacks } = opts

    this.io = io
    this.keyInfo = keyInfo
    this.abcTxLibCallbacks = callbacks
    this.walletLocalFolder = walletLocalFolder

    this.engineOn = false
    this.transactionsDirty = true
    this.addressesChecked = false
    this.numAddressesChecked = 0
    this.numAddressesToCheck = 0
    this.walletLocalDataDirty = false
    this.transactionsChangedArray = []
  }

  // *************************************
  // Private methods
  // *************************************
  engineLoop () {
    this.engineOn = true
    try {
      this.doInitialCallbacks()
      this.blockHeightInnerLoop()
      this.checkAddressesInnerLoop()
      this.checkTransactionsInnerLoop()
      this.saveWalletLoop()
    } catch (err) {
      io.console.error(err)
    }
  }

  async fetchGet (url:string) {
    const response = await this.io.fetch(url, {
      method: 'GET'
    })
    return response.json()
  }

  async fetchGetShitcoin (cmd:string, params:string) {
    return this.fetchGet(baseUrl + cmd + '/' + params)
  }

  async fetchPost (cmd:string, body:any) {
    const response = await this.io.fetch(baseUrl + cmd, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify(body)
    })
    return response.json()
  }

  // *************************************
  // Poll on the blockheight
  // *************************************
  async blockHeightInnerLoop () {
    while (this.engineOn) {
      try {
        const jsonObj = await this.fetchGetShitcoin('height', '')
        const valid = validateObject(jsonObj, {
          'type': 'object',
          'properties': {
            'height': {'type': 'number'}
          },
          'required': ['height']
        })

        if (valid) {
          this.walletLocalData.blockHeight = jsonObj.height
          this.walletLocalDataDirty = true
          console.log(
            'Block height changed: ' + this.walletLocalData.blockHeight
          )
          this.abcTxLibCallbacks.onBlockHeightChanged(
            this.walletLocalData.blockHeight
          )
        }
      } catch (err) {
        io.console.log('Error fetching height: ' + err)
      }
      try {
        await snooze(BLOCKHEIGHT_POLL_MILLISECONDS)
      } catch (err) {
        io.console.error(err)
      }
    }
  }

  async checkTransactionsInnerLoop () {
    while (this.engineOn) {
      try {
        const promiseArray = []
        const numTransactions = this.walletLocalData.transactionsToFetch.length

        for (var n = 0; n < numTransactions; n++) {
          const txid = this.walletLocalData.transactionsToFetch[n]
          const p = this.processTransactionFromServer(txid)
          promiseArray.push(p)
          console.log('checkTransactionsInnerLoop: check ' + txid)
        }

        if (promiseArray.length > 0) {
          await Promise.all(promiseArray)
        }
      } catch (err) {
        io.console.log('Error fetching transactions: ' + err)
      }
      try {
        await snooze(TRANSACTION_POLL_MILLISECONDS)
      } catch (err) {
        io.console.error(err)
      }
    }
  }

  async processTransactionFromServer (txid:string) {
    try {
      const jsonObj = await this.fetchGetShitcoin('transaction', txid)
      console.log('processTransactionFromServer: response.json():')
      console.log(jsonObj)

      //
      // Calculate the amount sent from the wallet
      //

      // Iterate through all the inputs and see if any are in our wallet
      let spendAmounts = []
      let receiveAmounts = []
      let amountsSatoshi = []

      const inputs = jsonObj.inputs
      const outputs = jsonObj.outputs

      const otherParams = new ShitcoinParams(inputs, outputs)

      for (const currencyCode of TOKEN_CODES) {
        receiveAmounts[currencyCode] = spendAmounts[currencyCode] = 0

        for (let input of inputs) {
          const addr = input.address
          const ccode = input.currencyCode
          const idx = this.findAddress(addr)
          if (idx !== -1 && ccode === currencyCode) {
            spendAmounts[ccode] += input.amount
          }
        }

        // Iterate through all the outputs and see if any are in our wallet
        for (let output of outputs) {
          const addr = output.address
          const ccode = output.currencyCode
          const idx = this.findAddress(addr)
          if (idx !== -1 && ccode === currencyCode) {
            receiveAmounts[ccode] += output.amount
          }
        }
        amountsSatoshi[currencyCode] =
          receiveAmounts[currencyCode] - spendAmounts[currencyCode]

        if (
          receiveAmounts[currencyCode] !== 0 ||
          spendAmounts[currencyCode] !== 0
        ) {
          const abcTransaction = new ABCTransaction(
            jsonObj.txid,
            jsonObj.txDate,
            currencyCode,
            jsonObj.blockHeight
            amountsSatoshi[currencyCode].toString(),
            jsonObj.networkFee,
            'iwassignedyoucantrustme',
            otherParams
          )
          this.addTransaction(currencyCode, abcTransaction)
        }
      }

      // Remove txid from transactionsToFetch
      const idx = this.walletLocalData.transactionsToFetch.indexOf(
        jsonObj.txid
      )
      if (idx !== -1) {
        this.walletLocalData.transactionsToFetch.splice(idx, 1)
        this.walletLocalDataDirty = true
      }

      if (this.walletLocalData.transactionsToFetch.length === 0) {
        this.abcTxLibCallbacks.onTransactionsChanged(
          this.transactionsChangedArray
        )
        this.transactionsChangedArray = []
      }
    } catch (err) {
      io.console.error('Error fetching transaction')
      io.console.error(err)
    }
  }

  // **********************************************
  // Check all addresses for new transactions
  // **********************************************
  async checkAddressesInnerLoop () {
    while (this.engineOn) {
      try {
        const promiseArray = []
        for (
          let n = 0;
          n < this.walletLocalData.unusedAddressIndex + GAP_LIMIT;
          n++
        ) {
          const address = this.addressFromIndex(n)
          const p = this.processAddressFromServer(address)
          promiseArray.push(p)

          if (this.walletLocalData.addressArray[n] === null) {
            this.walletLocalData.addressArray[n] = new AddressObject(address, null)
            this.walletLocalDataDirty = true
          } else {
            if (this.walletLocalData.addressArray[n].address !== address) {
              throw new Error('Derived address mismatch on index ' + n)
            }
          }

          console.log('checkAddressesInnerLoop: check ' + address)
        }

        if (promiseArray.length > 0) {
          this.numAddressesChecked = 0
          this.numAddressesToCheck = promiseArray.length
          const response = await Promise.all(promiseArray)
          // Iterate over all the address balances and get a final balance
          console.log(
            'checkAddressesInnerLoop: Completed responses: ' + response.length
          )

          const arrayAmounts = response
          let totalBalances = { TRD: 0 }
          for (let n = 0; n < arrayAmounts.length; n++) {
            const amountsObj:{} = arrayAmounts[n]
            for (const currencyCode:string in amountsObj) {
              if (totalBalances[currencyCode] === null) {
                totalBalances[currencyCode] = 0
              }
              totalBalances[currencyCode] += amountsObj[currencyCode]
              console.log(
                'checkAddressesInnerLoop: ' +
                currencyCode +
                ' ' +
                amountsObj[currencyCode] +
                ' total:' +
                totalBalances[currencyCode]
              )
            }
          }
          this.walletLocalData.totalBalances = totalBalances
          this.walletLocalDataDirty = true

          if (!this.addressesChecked) {
            this.addressesChecked = true
            this.abcTxLibCallbacks.onAddressesChecked(1)
            this.numAddressesChecked = 0
            this.numAddressesToCheck = 0
          }
        }
      } catch (err) {
        io.console.error('Error: checkAddressesInnerLoop: should not get here')
        io.console.error(err)
      }

      try {
        await snooze(ADDRESS_POLL_MILLISECONDS)
      } catch (err) {
        io.console.error(err)
      }
    }
  }

  // Algorithm to derive master pub key from master private key
  //  master public key = "pub[masterPrivateKey]". ie. "pub294709fe7a0sb0c8f7398f"
  // Algorithm to drive an address from index is "[index]-[masterPublicKey]" ie. "102-pub294709fe7a0sb0c8f7398f"
  addressFromIndex (index:number) {
    let addr = '' + index.toString() + '_' + this.walletLocalData.masterPublicKey

    if (index === 0) {
      addr = addr + '__600000' // Preload first addresss with some funds
    }
    return addr
  }

  async processAddressFromServer (address:string) {
    try {
      const jsonObj = await this.fetchGetShitcoin('address', address)
      console.log('processAddressFromServer: response.json():')
      console.log(jsonObj)
      const txids = jsonObj.txids
      const idx = this.findAddress(jsonObj.address)
      if (idx === -1) {
        throw new Error(
          'Queried address not found in addressArray:' + jsonObj.address
        )
      }
      this.walletLocalData.addressArray[idx] = jsonObj
      this.walletLocalDataDirty = true

      // Iterate over txids in address
      for (let txid of txids) {
        // This address has transactions
        console.log('processAddressFromServer: txid:' + txid)

        if (
          this.findTransaction(PRIMARY_CURRENCY, txid) === -1 &&
          this.walletLocalData.transactionsToFetch.indexOf(txid) === -1
        ) {
          console.log(
            'processAddressFromServer: txid not found. Adding:' + txid
          )
          this.walletLocalData.transactionsToFetch.push(txid)
          this.walletLocalDataDirty = true

          this.transactionsDirty = true
        }
      }

      if (
        (txids !== null && txids.length) ||
        this.walletLocalData.gapLimitAddresses.indexOf(jsonObj.address) !== -1
      ) {
        // Since this address is "used", make sure the unusedAddressIndex is incremented if needed
        if (idx >= this.walletLocalData.unusedAddressIndex) {
          this.walletLocalData.unusedAddressIndex = idx + 1
          this.walletLocalDataDirty = true
          console.log(
            'processAddressFromServer: set unusedAddressIndex:' +
            this.walletLocalData.unusedAddressIndex
          )
        }
      }

      this.numAddressesChecked++
      const progress = this.numAddressesChecked / this.numAddressesToCheck

      if (progress !== 1) {
        this.abcTxLibCallbacks.onAddressesChecked(progress)
      }
      return jsonObj.amounts
    } catch (err) {
      io.console.error('Error fetching address: ' + address)
      return 0
    }
  }

  findTransaction (currencyCode:string, txid:string) {
    if (this.walletLocalData.transactionsObj[currencyCode] === null) {
      return -1
    }

    const currency = this.walletLocalData.transactionsObj[currencyCode]
    return currency.findIndex(element => {
      return element.txid === txid
    })
  }

  findAddress (address:string) {
    return this.walletLocalData.addressArray.findIndex(element => {
      return element.address === address
    })
  }

  sortTxByDate (a:ABCTransaction, b:ABCTransaction) {
    return b.date - a.date
  }

  addTransaction (currencyCode:string, abcTransaction:ABCTransaction) {
    // Add or update tx in transactionsObj
    const idx = this.findTransaction(currencyCode, abcTransaction.txid)

    if (idx === -1) {
      console.log('addTransaction: adding and sorting:' + abcTransaction.txid)
      this.walletLocalData.transactionsObj[currencyCode].push(abcTransaction)

      // Sort
      this.walletLocalData.transactionsObj[currencyCode].sort(this.sortTxByDate)
      this.walletLocalDataDirty = true
    } else {
      // Update the transaction
      this.walletLocalData.transactionsObj[currencyCode][idx] = abcTransaction
      this.walletLocalDataDirty = true
      console.log('addTransaction: updating:' + abcTransaction.txid)
    }
    this.transactionsChangedArray.push(abcTransaction)
  }

  // *************************************
  // Save the wallet data store
  // *************************************
  async saveWalletLoop () {
    while (this.engineOn) {
      try {
        if (this.walletLocalDataDirty) {
          io.console.info('walletLocalDataDirty. Saving...')
          const walletJson = JSON.stringify(this.walletLocalData)
          await this.walletLocalFolder
            .folder(DATA_STORE_FOLDER)
            .file(DATA_STORE_FILE)
            .setText(walletJson)
          this.walletLocalDataDirty = false
        } else {
          io.console.info('walletLocalData clean')
        }
        await snooze(SAVE_DATASTORE_MILLISECONDS)
      } catch (err) {
        io.console.error(err)
        try {
          await snooze(SAVE_DATASTORE_MILLISECONDS)
        } catch (err) {
          io.console.error(err)
        }
      }
    }
  }

  doInitialCallbacks () {
    this.abcTxLibCallbacks.onBlockHeightChanged(
      this.walletLocalData.blockHeight
    )

    for (let currencyCode of TOKEN_CODES) {
      this.abcTxLibCallbacks.onTransactionsChanged(
        this.walletLocalData.transactionsObj[currencyCode]
      )
      this.abcTxLibCallbacks.onBalanceChanged(currencyCode, this.walletLocalData.totalBalances[currencyCode])
    }
  }

  // *************************************
  // Public methods
  // *************************************

  async startEngine () {
    try {
      const result =
        await this.walletLocalFolder
          .folder(DATA_STORE_FOLDER)
          .file(DATA_STORE_FILE)
          .getText(DATA_STORE_FOLDER, 'walletLocalData')

      this.walletLocalData = new WalletLocalData(result)
      this.walletLocalData.masterPublicKey = this.keyInfo.keys.masterPublicKey
      this.engineLoop()
    } catch (err) {
      try {
        io.console.info(err)
        io.console.info('No walletLocalData setup yet: Failure is ok')
        this.walletLocalData = new WalletLocalData(null)
        this.walletLocalData.masterPublicKey = this.keyInfo.keys.masterPublicKey
        await this.walletLocalFolder
          .folder(DATA_STORE_FOLDER)
          .file(DATA_STORE_FILE)
          .setText(JSON.stringify(this.walletLocalData))
        this.engineLoop()
      } catch (e) {
        io.console.error('Error writing to localDataStore. Engine not started:' + err)
      }
    }
  }

  // Synchronous
  killEngine () {
    // disconnect network connections
    // clear caches

    this.engineOn = false
    return true
  }

  // synchronous
  getBlockHeight ():string {
    return this.walletLocalData.blockHeight
  }

  // asynchronous
  enableTokens (tokens:Array<string>) {
    for (let token of tokens) {
      if (this.walletLocalData.enabledTokens.indexOf(token) !== -1) {
        this.walletLocalData.enabledTokens.push(token)
      }
    }
  }

  // synchronous
  getTokenStatus (token:string) {
    return this.walletLocalData.enabledTokens.indexOf(token) !== -1
  }

  // synchronous
  getBalance (options:any):string {
    let currencyCode = PRIMARY_CURRENCY

    if (typeof options !== 'undefined') {
      const valid = validateObject(options, {
        'type': 'object',
        'properties': {
          'currencyCode': {'type': 'string'}
        }
      })

      if (valid) {
        currencyCode = options.currencyCode
      }
    }

    return this.walletLocalData.totalBalances[currencyCode]
  }

  // synchronous
  getNumTransactions (options:any) {
    let currencyCode = PRIMARY_CURRENCY

    const valid = validateObject(options, {
      'type': 'object',
      'properties': {
        'currencyCode': {'type': 'string'}
      }
    })

    if (valid) {
      currencyCode = options.currencyCode
    }

    if (typeof this.walletLocalData.transactionsObj[currencyCode] === 'undefined') {
      return 0
    } else {
      return this.walletLocalData.transactionsObj[currencyCode].length
    }
  }

  // asynchronous
  async getTransactions (options:any) {
    let currencyCode:string = PRIMARY_CURRENCY

    const valid:boolean = validateObject(options, {
      'type': 'object',
      'properties': {
        'currencyCode': {'type': 'string'}
      }
    })

    if (valid) {
      currencyCode = options.currencyCode
    }

    if (typeof this.walletLocalData.transactionsObj[currencyCode] === 'undefined') {
      return []
    }

    let startIndex = 0
    let numEntries = 0
    if (options === null) {
      return (this.walletLocalData.transactionsObj[currencyCode].slice(0))
    }
    if (options.startIndex !== null && options.startIndex > 0) {
      startIndex = options.startIndex
      if (
        startIndex >=
        this.walletLocalData.transactionsObj[currencyCode].length
      ) {
        startIndex =
          this.walletLocalData.transactionsObj[currencyCode].length - 1
      }
    }
    if (options.numEntries !== null && options.numEntries > 0) {
      numEntries = options.numEntries
      if (
        numEntries + startIndex >
        this.walletLocalData.transactionsObj[currencyCode].length
      ) {
        // Don't read past the end of the transactionsObj
        numEntries =
          this.walletLocalData.transactionsObj[currencyCode].length -
          startIndex
      }
    }

    // Copy the appropriate entries from the arrayTransactions
    let returnArray = []

    if (numEntries) {
      returnArray = this.walletLocalData.transactionsObj[currencyCode].slice(
        startIndex,
        numEntries + startIndex
      )
    } else {
      returnArray = this.walletLocalData.transactionsObj[currencyCode].slice(
        startIndex
      )
    }
    return (returnArray)
  }

  // synchronous
  getFreshAddress (options:any) {
    return this.addressFromIndex(this.walletLocalData.unusedAddressIndex)
  }

  // synchronous
  addGapLimitAddresses (addresses:Array<string>, options:any) {
    for (let addr of addresses) {
      if (this.walletLocalData.gapLimitAddresses.indexOf(addr) === -1) {
        this.walletLocalData.gapLimitAddresses.push(addr)
      }
    }
  }

  // synchronous
  isAddressUsed (address:string, options:any) {
    let idx = this.findAddress(address)
    if (idx !== -1) {
      const addrObj = this.walletLocalData.addressArray[idx]
      if (addrObj !== null) {
        if (addrObj.txids && addrObj.txids.length > 0) {
          return true
        }
      }
    }
    idx = this.walletLocalData.gapLimitAddresses.indexOf(address)
    return (idx !== -1)
  }

  // asynchronous
  async makeSpend (abcSpendInfo:any) {
    // returns an ABCTransaction data structure, and checks for valid info
    const valid = validateObject(abcSpendInfo, {
      'type': 'object',
      'properties': {
        'networkFeeOption': { 'type': 'string' },
        'spendTargets': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'currencyCode': { 'type': 'string' },
              'publicAddress': { 'type': 'string' },
              'amountSatoshi': { 'type': 'number' },
              'nativeAmount': { 'type': 'string' },
              'destMetadata': { 'type': 'object' },
              'destWallet': { 'type': 'object' }
            },
            'required': [
              'publicAddress',
              'nativeAmount'
            ]
          }
        }
      },
      'required': [ 'spendTargets' ]
    })

    if (!valid) {
      return (new Error('Error: invalid ABCSpendInfo'))
    }

    // ******************************
    // Get the fee amount
    let networkFee = '50000'
    if (abcSpendInfo.networkFeeOption === 'high') {
      networkFee = bns.add(networkFee, '10000')
    } else if (abcSpendInfo.networkFeeOption === 'low') {
      networkFee = bns.sub(networkFee, '10000')
    } else if (abcSpendInfo.networkFeeOption === 'custom') {
      if (
        abcSpendInfo.customNetworkFee === null ||
        bns.lt(abcSpendInfo.customNetworkFee, '0')
      ) {
        throw (new Error('Invalid custom fee'))
      } else {
        networkFee = abcSpendInfo.customNetworkFee
      }
    }

    if (typeof abcSpendInfo.currencyCode === 'string') {
      if (!this.getTokenStatus(abcSpendInfo.currencyCode)) {
        return (new Error('Error: Token not supported or enabled'))
      }
    } else {
      abcSpendInfo.currencyCode = 'TRD'
    }
    const currencyCode = abcSpendInfo.currencyCode

    const InsufficientFundsError = new Error('Insufficient funds')
    InsufficientFundsError.name = 'InsufficientFundsError'

    // ******************************
    // Calculate the total to send
    let totalSpends = {}
    totalSpends[PRIMARY_CURRENCY] = 0
    let outputs = []
    const spendTargets = abcSpendInfo.spendTargets

    for (let spendTarget of spendTargets) {
      let nativeAmount = '0'
      if (typeof spendTarget.nativeAmount === 'string') {
        nativeAmount = spendTarget.nativeAmount
      } else if (typeof spendTarget.amountSatoshi === 'number') {
        nativeAmount = spendTarget.toString()
      } else {
        throw (new Error('Error: no amount specified'))
      }

      let currencyCode = PRIMARY_CURRENCY
      if (spendTarget.currencyCode !== null) {
        currencyCode = spendTarget.currencyCode
      }
      if (totalSpends[currencyCode] === null) {
        totalSpends[currencyCode] = '0'
      }
      totalSpends[currencyCode] = bns.add(totalSpends[currencyCode], nativeAmount)
      outputs.push({
        currencyCode,
        address: spendTarget.publicAddress,
        amount: nativeAmount
      })
    }
    totalSpends[PRIMARY_CURRENCY] = bns.add(totalSpends[PRIMARY_CURRENCY], networkFee)

    for (const n in totalSpends) {
      const totalSpend = totalSpends[n]
      // XXX check if spends exceed totals
      if (bns.gt(totalSpend, this.walletLocalData.totalBalances[n])) {
        io.console.error('Error: insufficient balance for token:' + n)
        throw (InsufficientFundsError)
      }
    }

    // ****************************************************
    // Pick inputs. Picker will use all funds in an address
    let totalInputAmounts = {}
    let inputs = []
    const addressArray = this.walletLocalData.addressArray
    // Get a new address for change if needed
    const changeAddress = this.addressFromIndex(
      this.walletLocalData.unusedAddressIndex
    )

    for (let currencyCode in totalSpends) {
      for (let addressObj of addressArray) {
        if (addressObj.amounts && addressObj.amounts[currencyCode] > 0) {
          if (totalInputAmounts[currencyCode] === null) {
            totalInputAmounts[currencyCode] = '0'
          }

          totalInputAmounts[currencyCode] =
            bns.add(totalInputAmounts[currencyCode], addressObj.amounts[currencyCode])
          let amt = '0'
          if (addressObj && addressObj.amounts) {
            inputs.push({
              currencyCode,
              address: addressObj.address,
              amount: amt
            })
          }
        }
        if (totalInputAmounts[currencyCode] >= totalSpends[currencyCode]) {
          break
        }
      }

      if (totalInputAmounts[currencyCode] < totalSpends[currencyCode]) {
        io.console.error('Error: insufficient balance for token:' + currencyCode)
        throw (InsufficientFundsError)
      }
      if (totalInputAmounts[currencyCode] > totalSpends[currencyCode]) {
        outputs.push({
          currencyCode,
          address: changeAddress,
          amount: totalInputAmounts[currencyCode] - totalSpends[currencyCode]
        })
      }
    }

    const shitcoinParams = new ShitcoinParams(inputs, outputs)
    // **********************************
    // Create the unsigned ABCTransaction
    const abcTransaction = new ABCTransaction(
      '',
      0,
      currencyCode,
      '0',
      totalSpends[PRIMARY_CURRENCY],
      '0',
      '0',
      shitcoinParams
    )

    return abcTransaction
  }

  // asynchronous
  async signTx (abcTransaction:ABCTransaction) {
    abcTransaction.signedTx = 'iwassignedjusttrustme'
    return (abcTransaction)
  }

  // asynchronous
  async broadcastTx (abcTransaction:ABCTransaction) {
    try {
      const jsonObj = await this.fetchPost('spend', abcTransaction.otherParams)
      // Copy params from returned transaction object to our abcTransaction object
      abcTransaction.blockHeight = jsonObj.blockHeight
      abcTransaction.txid = jsonObj.txid
      abcTransaction.date = jsonObj.txDate
      return (abcTransaction)
    } catch (err) {
      throw (new Error('Error: broadcastTx failed'))
    }
  }

  // asynchronous
  async saveTx (abcTransaction:ABCTransaction) {
    this.addTransaction(abcTransaction.currencyCode, abcTransaction)
  }
}

export { makePlugin }
