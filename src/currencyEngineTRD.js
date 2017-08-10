/**
 * Created by paul on 8/7/17.
 */
// @flow

import { txLibInfo } from './currencyInfoTRD.js'
import { validate } from 'jsonschema'
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
// const baseUrl = 'http://localhost:8080/api/'

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

async function fetchGet (url:string) {
  const response = await io.fetch(url, {
    method: 'GET'
  })
  return response.json()
}

async function fetchGetShitcoin (cmd:string, params:string) {
  const url = baseUrl + cmd + '/' + params
  return fetchGet(url)
}

async function fetchPost (cmd:string, body:any) {
  const jsonStr = JSON.stringify(body)
  const response = await io.fetch(cmd, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    method: 'POST',
    body: jsonStr
  })
  return response.json()
}

async function fetchPostShitcoin (cmd:string, body:any) {
  const url = baseUrl + cmd
  return fetchPost(url, body)
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
  transactionsObj:any
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

export class ShitcoinEngine {
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

  constructor (_io:any, keyInfo:any, opts:any) {
    const { walletLocalFolder, callbacks } = opts

    io = _io
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

  // *************************************
  // Poll on the blockheight
  // *************************************
  async blockHeightInnerLoop () {
    while (this.engineOn) {
      try {
        const jsonObj = await fetchGetShitcoin('height', '')
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
        io.console.error('Error fetching height: ' + err)
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
      const promiseArray = []
      const numTransactions = this.walletLocalData.transactionsToFetch.length

      for (let n = 0; n < numTransactions; n++) {
        const txid = this.walletLocalData.transactionsToFetch[n]
        const p = this.processTransactionFromServer(txid)
        promiseArray.push(p)
        console.log('checkTransactionsInnerLoop: check ' + txid)
      }

      try {
        if (promiseArray.length > 0) {
          await Promise.all(promiseArray)
        }
      } catch (err) {
        io.console.error('Error fetching transactions: ' + err)
      }
      try {
        await snooze(TRANSACTION_POLL_MILLISECONDS)
      } catch (err) {
        io.console.error(err)
      }
    }
  }

  async processTransactionFromServer (txid:string) {
    let jsonObj
    try {
      jsonObj = await fetchGetShitcoin('transaction', txid)
    } catch (err) {
      io.console.error('Error fetching transaction')
      io.console.error(err)
      return
    }
    io.console.info('processTransactionFromServer: response.json():')
    io.console.info(jsonObj)

    const valid = validateObject(jsonObj, {
      'type': 'object',
      'properties': {
        'txid': { 'type': 'string' },
        'networkFee': { 'type': 'string' },
        'inputs': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'currencyCode': { 'type': 'string' },
              'address': { 'type': 'string' },
              'amount': { 'type': 'string' }
            },
            'required': [
              'currencyCode',
              'address',
              'amount'
            ]
          }
        },
        'outputs': {
          'type': 'array',
          'items': {
            'type': 'object',
            'properties': {
              'currencyCode': { 'type': 'string' },
              'address': { 'type': 'string' },
              'amount': { 'type': 'string' }
            },
            'required': [
              'currencyCode',
              'address',
              'amount'
            ]
          }
        }
      },
      'required': [
        'txid', 'networkFee', 'inputs', 'outputs'
      ]
    })

    if (!valid) {
      io.console.error('Invalid transaction data from server')
      return
    }

    //
    // Calculate the amount sent from the wallet
    //

    // Iterate through all the inputs and see if any are in our wallet
    let spendAmounts:any = {}
    let receiveAmounts:any = {}
    let nativeAmounts:any = {}

    const inputs = jsonObj.inputs
    const outputs = jsonObj.outputs

    const otherParams = new ShitcoinParams(inputs, outputs)

    for (const currencyCode of TOKEN_CODES) {
      receiveAmounts[currencyCode] = '0'
      spendAmounts[currencyCode] = '0'

      for (let input of inputs) {
        const addr = input.address
        const ccode = input.currencyCode
        const idx = this.findAddress(addr)
        if (idx !== -1 && ccode === currencyCode) {
          const tempVal = spendAmounts[ccode]
          spendAmounts[ccode] = bns.add(tempVal, input.amount)
        }
      }

      // Iterate through all the outputs and see if any are in our wallet
      for (let output of outputs) {
        const addr = output.address
        const ccode = output.currencyCode
        const idx = this.findAddress(addr)
        if (idx !== -1 && ccode === currencyCode) {
          const tempVal = receiveAmounts[ccode]
          receiveAmounts[ccode] = bns.add(tempVal, output.amount)
        }
      }
      const tempVal = receiveAmounts[currencyCode]
      const tempVal2 = spendAmounts[currencyCode]
      nativeAmounts[currencyCode] = bns.sub(tempVal, tempVal2)

      if (
        receiveAmounts[currencyCode] !== '0' ||
        spendAmounts[currencyCode] !== '0'
      ) {
        const abcTransaction = new ABCTransaction(
          jsonObj.txid,
          jsonObj.txDate,
          currencyCode,
          jsonObj.blockHeight,
          nativeAmounts[currencyCode].toString(),
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
  }

  // **********************************************
  // Check all addresses for new transactions
  // **********************************************
  async checkAddressesInnerLoop () {
    while (this.engineOn) {
      const promiseArray = []
      for (
        let n = 0;
        n < this.walletLocalData.unusedAddressIndex + GAP_LIMIT;
        n++
      ) {
        const address = this.addressFromIndex(n)
        const p = this.processAddressFromServer(address)
        promiseArray.push(p)

        if (typeof this.walletLocalData.addressArray[n] === 'undefined') {
          this.walletLocalData.addressArray[n] = new AddressObject(address, null)
          this.walletLocalDataDirty = true
        } else {
          if (this.walletLocalData.addressArray[n].address !== address) {
            throw new Error('Derived address mismatch on index ' + n)
          }
        }

        io.console.info('checkAddressesInnerLoop: check ' + address)
      }

      if (promiseArray.length > 0) {
        this.numAddressesChecked = 0
        this.numAddressesToCheck = promiseArray.length
        let response = {}
        try {
          response = await Promise.all(promiseArray)
        } catch (err) {
          io.console.error('Error: checkAddressesInnerLoop:')
          io.console.error(err)
          continue
        }
        // Iterate over all the address balances and get a final balance
        io.console.info(
          'checkAddressesInnerLoop: Completed responses: ' + response.length
        )

        const arrayAmounts = response
        let totalBalances = { TRD: '0' }
        for (let n = 0; n < arrayAmounts.length; n++) {
          const amountsObj:any = arrayAmounts[n]
          for (const currencyCode:any in amountsObj) {
            if (this.getTokenStatus(currencyCode)) {
              if (typeof totalBalances[currencyCode] === 'undefined') {
                totalBalances[currencyCode] = '0'
              }
              const tempVal = totalBalances[currencyCode]
              const tempVal2 = amountsObj[currencyCode]
              totalBalances[currencyCode] = bns.add(tempVal, tempVal2)
              io.console.info(
                'checkAddressesInnerLoop: ' +
                currencyCode +
                ' ' +
                amountsObj[currencyCode] +
                ' total:' +
                totalBalances[currencyCode]
              )
            }
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
    let jsonObj = {}
    try {
      jsonObj = await fetchGetShitcoin('address', address)
    } catch (err) {
      io.console.error('Error fetching address: ' + address)
      return 0
    }

    io.console.info('processAddressFromServer: response.json():')
    io.console.info(jsonObj)
    let txids = jsonObj.txids
    const idx = this.findAddress(jsonObj.address)
    if (idx === -1) {
      throw new Error(
        'Queried address not found in addressArray:' + jsonObj.address
      )
    }
    this.walletLocalData.addressArray[idx] = jsonObj
    this.walletLocalDataDirty = true

    if (!txids) {
      txids = []
    }

    // Iterate over txids in address
    for (let txid of txids) {
      // This address has transactions
      io.console.info('processAddressFromServer: txid:' + txid)

      if (
        this.findTransaction(PRIMARY_CURRENCY, txid) === -1 &&
        this.walletLocalData.transactionsToFetch.indexOf(txid) === -1
      ) {
        io.console.info(
          'processAddressFromServer: txid not found. Adding:' + txid
        )
        this.walletLocalData.transactionsToFetch.push(txid)
        this.walletLocalDataDirty = true

        this.transactionsDirty = true
      }
    }

    if (
      (txids.length) ||
      this.walletLocalData.gapLimitAddresses.indexOf(jsonObj.address) !== -1
    ) {
      // Since this address is "used", make sure the unusedAddressIndex is incremented if needed
      if (idx >= this.walletLocalData.unusedAddressIndex) {
        this.walletLocalData.unusedAddressIndex = idx + 1
        this.walletLocalDataDirty = true
        io.console.info(
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
  }

  findTransaction (currencyCode:string, txid:string) {
    if (!this.walletLocalData.transactionsObj[currencyCode]) {
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
      io.console.info('addTransaction: adding and sorting:' + abcTransaction.txid)
      this.walletLocalData.transactionsObj[currencyCode].push(abcTransaction)

      // Sort
      this.walletLocalData.transactionsObj[currencyCode].sort(this.sortTxByDate)
      this.walletLocalDataDirty = true
    } else {
      // Update the transaction
      this.walletLocalData.transactionsObj[currencyCode][idx] = abcTransaction
      this.walletLocalDataDirty = true
      io.console.info('addTransaction: updating:' + abcTransaction.txid)
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

  async startEngine (opts:any = {}) {
    let newData = false
    if (opts.resetData === 'true') {
      newData = true
    }

    let result = ''
    if (!newData) {
      try {
        result =
          await this.walletLocalFolder
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
      this.walletLocalData = new WalletLocalData(null)
    } else {
      this.walletLocalData = new WalletLocalData(result)
    }
    this.walletLocalData.masterPublicKey = this.keyInfo.keys.masterPublicKey

    if (newData) {
      try {
        await this.walletLocalFolder
          .folder(DATA_STORE_FOLDER)
          .file(DATA_STORE_FILE)
          .setText(JSON.stringify(this.walletLocalData))
      } catch (err) {
        io.console.error('Error writing to localDataStore. Engine not started:' + err)
        return
      }
    }
    this.engineLoop()
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
  getTokenStatus (token:string):boolean {
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
    if (!options) {
      return (this.walletLocalData.transactionsObj[currencyCode].slice(0))
    }
    if (typeof options.startIndex !== 'undefined' && options.startIndex > 0) {
      startIndex = options.startIndex
      if (
        startIndex >=
        this.walletLocalData.transactionsObj[currencyCode].length
      ) {
        startIndex =
          this.walletLocalData.transactionsObj[currencyCode].length - 1
      }
    }
    if (typeof options.numEntries !== 'undefined' && options.numEntries > 0) {
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
      if (typeof addrObj !== 'undefined') {
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
        !abcSpendInfo.customNetworkFee ||
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
    totalSpends[PRIMARY_CURRENCY] = '0'
    let outputs = []
    const spendTargets = abcSpendInfo.spendTargets

    for (let spendTarget of spendTargets) {
      let nativeAmount = '0'
      if (typeof spendTarget.nativeAmount === 'string') {
        nativeAmount = spendTarget.nativeAmount
      } else {
        throw (new Error('Error: no amount specified'))
      }

      let currencyCode = PRIMARY_CURRENCY
      if (typeof spendTarget.currencyCode !== 'undefined') {
        currencyCode = spendTarget.currencyCode
      }
      if (typeof totalSpends[currencyCode] === 'undefined') {
        totalSpends[currencyCode] = '0'
      }
      const tempVal = totalSpends[currencyCode]
      const tempVal2 = bns.add(tempVal, nativeAmount)
      totalSpends[currencyCode] = tempVal2
      outputs.push({
        currencyCode,
        address: spendTarget.publicAddress,
        amount: nativeAmount
      })
    }
    const tempVal = totalSpends[PRIMARY_CURRENCY]
    totalSpends[PRIMARY_CURRENCY] = bns.add(tempVal, networkFee)

    for (let currencyCode of this.walletLocalData.enabledTokens) {
      const totalSpend = totalSpends[currencyCode]
      if (typeof totalSpend === 'undefined') {
        continue
      }
      // XXX check if spends exceed totals
      const tempVal = this.walletLocalData.totalBalances[currencyCode]
      if (bns.gt(totalSpend, tempVal)) {
        io.console.error('Error: insufficient balance for token:' + currencyCode)
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

    for (let currencyCode of this.walletLocalData.enabledTokens) {
      if (typeof totalSpends[currencyCode] === 'undefined') {
        continue
      }
      if (typeof totalInputAmounts[currencyCode] === 'undefined') {
        totalInputAmounts[currencyCode] = '0'
      }
      for (let addressObj of addressArray) {
        if (addressObj.amounts && bns.gt(addressObj.amounts[currencyCode], '0')) {
          const tempVal = totalInputAmounts[currencyCode]
          const tempVal2 = addressObj.amounts[currencyCode]
          totalInputAmounts[currencyCode] =
            bns.add(tempVal, tempVal2)
          if (addressObj && addressObj.amounts) {
            inputs.push({
              currencyCode,
              address: addressObj.address,
              amount: addressObj.amounts[currencyCode]
            })
          }
        }
        if (bns.gte(totalInputAmounts[currencyCode], totalSpends[currencyCode])) {
          break
        }
      }

      if (bns.lt(totalInputAmounts[currencyCode], totalSpends[currencyCode])) {
        io.console.error('Error: insufficient balance for token:' + currencyCode)
        throw (InsufficientFundsError)
      }
      if (bns.gt(totalInputAmounts[currencyCode], totalSpends[currencyCode])) {
        const changeAmt = bns.sub(totalInputAmounts[currencyCode], totalSpends[currencyCode])
        outputs.push({
          currencyCode,
          address: changeAddress,
          amount: changeAmt
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
      const jsonObj = await fetchPostShitcoin('spend', abcTransaction.otherParams)
      // Copy params from returned transaction object to our abcTransaction object
      abcTransaction.blockHeight = jsonObj.blockHeight
      abcTransaction.txid = jsonObj.txid
      abcTransaction.date = jsonObj.txDate
      return (abcTransaction)
    } catch (err) {
      io.console.error('Error: broadcastTx failed')
      throw new Error(err)
    }
  }

  // asynchronous
  async saveTx (abcTransaction:ABCTransaction) {
    this.addTransaction(abcTransaction.currencyCode, abcTransaction)
  }
}
