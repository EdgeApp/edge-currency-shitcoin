# Airbitz Shitcoin Currency Plugin

Implement Shitcoin transactions using the Airbitz currency plugin API
The API can be found [here](https://developer.airbitz.co/javascript/#currency-plugin-api)

## Installing

Since this package is not on NPM, you will have to do things manually:

1. Clone this project into a directory next to your project.
2. Add to your project's `package.json`:

    ```
    cd ../your-project
    npm install git+ssh://git@github.com/Airbitz/airbitz-currency-dash.git
    ```

## Usage

Initialize the plugin:

```
import { ShitcoinPlugin } from `airbitz-currency-dash`

ShitcoinPlugin.makePlugin({
  io: yourPlatformSpecifcIo
}).then(shitcoinPlugin => {

})
```

Now you can pass `shitcoinPlugin` to `airbitz-core-js`.


## Developing the library

The following instructions are for those looking to develop this library or use it as a template to build a new currency-plugin for Airbitz.

1. Install cli-tool, dependencies, & build the library:

    ```
    git clone git@github.com:Airbitz/airbitz-cli.git
    git clone git@github.com:Airbitz/airbitz-cli-react-native.git
    git clone git@github.com:Airbitz/airbitz-currency-shitcoin.git
    cd airbitz-currency-shitcoin
    npm install
    cd ../airbitz-cli
    npm install
    cd ../airbitz-cli-react-native
    npm install
    npm run updot
    ```

`updot` is a tool to copy needed files from peer dependencies into the node_modules of the project it is run in. This replaces the need for `npm link` which is broken in React Native. In this setup, it will copy `airbitz-cli` and `airbitz-currency-shitcoin` into `airbitz-cli-react-native/node_modules`. During development, run `npm run updot` after making any changes to `airbitz-currency-shitcoin` or `airbitz-cli`

The CLI mobile app uses React Native and iOS/Android. As of 2017-08-08, you will need to use iOS/Xcode to run the CLI tool. Install React Native first:

    npm install -g create-react-native-app

Launch Xcode and open the project `airbitz-cli-react-native/ios/airbitz_cli.xcodeproj`.

Run the app in the simulator by clicking the Play button on xcode. You'll then have a mobile app launch in the simulator with a command line prompt to execute CLI commands. CLI command documentation can be seen by running `airbitz-cli help` from within the `airbitz-cli` project directory.

Example CLI commands:

| Command | Description |
| --- | --- |
| `tx-info shitcoin` | Get the `currencyInfo` object from the plugin |
| `tx-make-engine shitcoin 'wallet:shitcoin'` | Call makeEngine() method of the shitcoin plugin and createMasterKeys() with a `wallet:shitcoin` walletType |
| `tx-start-engine` | Call startEngine() method of the plugin called in `tx-make-engine` |
| `tx-balance DASH` | Call getBalance('TRD') |
| `tx-get-address` | Call getAddress() |
| `tx-spend 3_pub1091290ur28u3t 15000 TRD` | Spend 1.5 shitcoin to given address |
| `tx-transactions` | Call getTransactions() |

These CLI commands can be used to test the actual routines exported by the currency-plugin

