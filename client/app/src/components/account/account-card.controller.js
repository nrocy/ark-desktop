;(function () {
  'use strict'

  /**
   * NOTE This component uses the entire AccountController yet: it's the first
   * step to refactor the `index.html`
   */

  angular
    .module('arkclient.components')
    .component('accountCard', {
      templateUrl: 'src/components/account/templates/account-card.html',
      bindings: {
        accountCtrl: '=',
        addressBookCtrl: '='
      },
      controller: ['$scope', '$mdDialog', '$mdBottomSheet', 'gettextCatalog', 'accountService', 'storageService', 'toastService', 'transactionBuilderService', 'utilityService', 'neoApiService', '$timeout', AccountCardController]
    })

  function AccountCardController ($scope, $mdDialog, $mdBottomSheet, gettextCatalog, accountService, storageService, toastService, transactionBuilderService, utilityService, neoApiService, $timeout) {
    let getCurrentAccount = () => null

    $scope.$on('app:onURI', (event, scheme) => {
      this.showSendTransaction(getCurrentAccount(), scheme)
    })

    this.$onInit = () => {
      this.ul = this.accountCtrl
      const ul = this.ul
      // by assigning this to the function, we can ensure, that a call to the function will always return the currently active account
      getCurrentAccount = () => ul.selected
      this.ab = this.addressBookCtrl
    }

    this.accountMenuItems = account => {
      const items = []
      const add = (text, icon) => items.push({ name: gettextCatalog.getString(text), icon })

      add('Open in explorer', 'open_in_new')

      if (!account.ledger) {
        add('Remove', 'clear')
      }
      if (!account.delegate) {
        add('Label', 'local_offer')

        if (!account.ledger) {
          add('Register Delegate', 'perm_identity')
        }
      }

      add('Timestamp Document', 'verified_user')

      if (!account.secondSignature && !account.ledger) {
        add('Second Passphrase', 'lock')
      }

      return items
    }

    this.confirmRemoval = account => {
      const confirm = $mdDialog.confirm({
        title: gettextCatalog.getString('Remove Account') + ' ' + account.address,
        ariaLabel: gettextCatalog.getString('Remove Account'),
        theme: this.accountCtrl.currentTheme,
        textContent: gettextCatalog.getString('Remove this account from your wallet. ' +
          'The account may be added again using the original passphrase of the account.'),
        ok: gettextCatalog.getString('Remove account'),
        cancel: gettextCatalog.getString('Cancel')
      })

      return $mdDialog.show(confirm).then(() => {
        return accountService.removeAccount(account).then(() => {
          this.accountCtrl.accounts = accountService.loadAllAccounts()

          if (this.accountCtrl.accounts && this.accountCtrl.accounts.length > 0) {
            this.accountCtrl.selectAccount(this.accountCtrl.accounts[0])
          } else {
            this.accountCtrl.selected = null
          }

          toastService.success('Account removed!', 3000)
        })
      })
    }

    this.promptLabel = account => {
      const currentLabel = accountService.getUsername(account.address)

      const prompt = $mdDialog.prompt({
        title: gettextCatalog.getString('Label'),
        ariaLabel: gettextCatalog.getString('Label'),
        theme: this.accountCtrl.currentTheme,
        textContent: gettextCatalog.getString('Please enter a short label.'),
        placeholder: gettextCatalog.getString('Label'),
        initialValue: currentLabel,
        ok: gettextCatalog.getString('Set'),
        cancel: gettextCatalog.getString('Cancel')
      })

      return $mdDialog.show(prompt).then(label => {
        accountService.setUsername(account.address, label)
        this.accountCtrl.accounts = accountService.loadAllAccounts()
        toastService.success('Label set', 3000)
      })
    }

    /**
     * Show the account menu on the bottom sheet
     */
    this.showAccountMenu = selectedAccount => {
      const items = this.accountMenuItems(selectedAccount)

      const answer = action => {
        $mdBottomSheet.hide()

        if (action === gettextCatalog.getString('Open in explorer')) {
          this.accountCtrl.openExplorer('/address/' + selectedAccount.address)
        } else if (action === gettextCatalog.getString('Timestamp Document')) {
          this.accountCtrl.timestamp(selectedAccount)
        } else if (action === gettextCatalog.getString('Remove')) {
          this.confirmRemoval(selectedAccount)
        } else if (action === gettextCatalog.getString('Register Delegate')) {
          this.accountCtrl.createDelegate(selectedAccount)
        } else if (action === gettextCatalog.getString('Label')) {
          this.promptLabel(selectedAccount)
        } else if (action === gettextCatalog.getString('Second Passphrase')) {
          this.accountCtrl.createSecondPassphrase(selectedAccount)
        }
      }

      $scope.bs = {
        label: selectedAccount.username,
        address: selectedAccount.address,
        answer,
        items
      }

      $mdBottomSheet.show({
        parent: angular.element(document.getElementById('app')),
        templateUrl: 'src/components/account/templates/account-menu.html',
        clickOutsideToClose: true,
        preserveScope: true,
        scope: $scope
      })
    }

    this.submitTransaction = (selectedAccount, formData) => {
      return transactionBuilderService.createSendTransaction({
        ledger: selectedAccount.ledger,
        publicKey: selectedAccount.publicKey,
        fromAddress: formData.fromAddress,
        toAddress: formData.toAddress,
        amount: parseInt(utilityService.arkToArktoshi(formData.amount, 0)),
        smartbridge: formData.smartbridge,
        masterpassphrase: formData.passphrase,
        secondpassphrase: formData.secondpassphrase
      })
        .then(transaction => {
          this.accountCtrl.showValidateTransaction(selectedAccount, transaction)
        },
        this.accountCtrl.formatAndToastError)
    }

    /**
     * Show the send transaction dialog
     */
    this.showSendTransaction = (selectedAccount, uriScheme) => {
      const passphrases = accountService.getPassphrases(selectedAccount.address)

      let data = {
        ledger: selectedAccount.ledger,
        fromAddress: selectedAccount ? selectedAccount.address : '',
        fromLabel: selectedAccount ? selectedAccount.username : null,
        secondSignature: selectedAccount ? selectedAccount.secondSignature : '',
        passphrase: passphrases[0] ? passphrases[0] : '',
        secondpassphrase: passphrases[1] ? passphrases[1] : ''
      }

      if (uriScheme) {
        data.amount = uriScheme.amount
        data.smartbridge = uriScheme.vendorField
      }

      const openFile = () => {
        const fs = require('fs')

        require('electron').remote.dialog.showOpenDialog(fileNames => {
          if (fileNames === undefined) return
          const fileName = fileNames[0]

          fs.readFile(fileName, 'utf8', (err, data) => {
            if (err) {
              toastService.error('Unable to load file' + ': ' + err)
            } else {
              try {
                const transaction = JSON.parse(data)

                if (transaction.type === undefined) {
                  return toastService.error('Invalid transaction file')
                }

                this.accountCtrl.showValidateTransaction(selectedAccount, transaction)
              } catch (ex) {
                toastService.error('Invalid file format')
              }
            }
          })
        })
      }

      // testing goodies
      // var data={
      //   fromAddress: selectedAccount ? selectedAccount.address: '',
      //   secondSignature: selectedAccount ? selectedAccount.secondSignature: '',
      //   passphrase: 'insect core ritual alcohol clinic opera aisle dial entire dust symbol vintage',
      //   secondpassphrase: passphrases[1] ? passphrases[1] : '',
      //   toAddress: 'AYxKh6vwACWicSGJATGE3rBreFK7whc7YA',
      //   amount: 1,
      // }
      function getTotalBalance (fee) {
        const balance = selectedAccount.balance
        return utilityService.arktoshiToArk(fee ? balance - fee : balance)
      }

      function fillSendableBalance () {
        function setBalance (fee) {
          const sendableBalance = getTotalBalance(fee)
          $scope.send.data.amount = sendableBalance > 0 ? sendableBalance : 0
        }
        // set the balance immediately, so the user sees something
        setBalance(accountService.defaultFees.send)
        // now get the real fees and set it again if necessary
        accountService.getFees(true).then((fees) => {
          if (fees.send !== accountService.defaultFees.send) {
            setBalance(fees.send)
          }
        })
      }

      const submit = () => {
        if (!$scope.sendArkForm.$valid) {
          return
        }

        // In case of data selected from contacts
        if ($scope.send.data.toAddress.address) {
          $scope.send.data.toAddress = $scope.send.data.toAddress.address
        }

        // Remove bad characters before and after in case of bad copy/paste
        $scope.send.data.toAddress = $scope.send.data.toAddress.trim()
        $scope.send.data.passphrase = $scope.send.data.passphrase.trim()

        if ($scope.send.data.secondpassphrase) {
          $scope.send.data.secondpassphrase = $scope.send.data.secondpassphrase.trim()
        }

        $mdDialog.hide()

        this.submitTransaction(selectedAccount, $scope.send.data)
      }

      function searchTextChange (text) {
        $scope.send.data.toAddress = text
        validateReceiverAddress(text)
      }

      function selectedContactChange (contact) {
        if (contact) {
          $scope.send.data.toAddress = contact.address
          validateReceiverAddress(contact.address)
        }
      }

      let receiverValidationCycle = 0
      function validateReceiverAddress (address) {
        // failType specifies the "fail level", but is at the same time, also the icon name
        $scope.receiverValidation = {failType: null, message: null}

        if (!address) {
          return
        }

        if (!accountService.isValidAddress(address)) {
          $scope.receiverValidation.message = gettextCatalog.getString('The address is not valid!')
          $scope.receiverValidation.failType = 'error'
          return
        }

        const currentAccount = getCurrentAccount()
        if (currentAccount && currentAccount.address === address) {
          $scope.receiverValidation.message = gettextCatalog.getString('This address is your own address. Are you sure you want to send to your own address?')
          $scope.receiverValidation.failType = 'warning'
          return
        }

        const currentCycle = ++receiverValidationCycle
        accountService.getTransactions(address, 0, 1).then(txs => {
          // if this check is not true it means that the address has already been changed in the meantime and we can
          // ignore the result, also if a failType is already set, we return, because we don't want to overwrite a warning or error
          if (currentCycle !== receiverValidationCycle || txs.length || $scope.receiverValidation.failType) {
            return
          }

          $scope.receiverValidation.message = gettextCatalog.getString('It appears the address doesn\'t have any transactions. Are you sure it\'s correct?')
          $scope.receiverValidation.failType = 'info'
        })

        neoApiService.doesAddressExist(address).then(exists => {
          if (currentCycle !== receiverValidationCycle || !exists) {
            return
          }

          $scope.receiverValidation.message = gettextCatalog.getString('It looks like this is a \'NEO\' address. Are you sure it\'s correct?')
          $scope.receiverValidation.failType = 'warning'
        })
      }

      const querySearch = (text) => {
        text = text.toLowerCase()

        let accounts = this.accountCtrl.getAllAccounts()
        let contacts = storageService.get('contacts') || []

        contacts = contacts.concat(accounts).sort((a, b) => {
          if (a.name && b.name) return a.name < b.name
          else if (a.username && b.username) return a.username < b.username
          else if (a.username && b.name) return a.username < b.name
          else if (a.name && b.username) return a.name < b.username
        })

        return contacts.filter((account) => {
          return (account.address.toLowerCase().indexOf(text) > -1) || (account.name && (account.name.toLowerCase().indexOf(text) > -1))
        })
      }

      function cancel () {
        $mdDialog.hide()
      }

      function checkContacts (input) {
        if (input[0] !== '@') return true
      }

      $scope.ac = this.accountCtrl

      $scope.send = {
        openFile: openFile,
        data: data,
        cancel: cancel,
        submit: submit,
        checkContacts: checkContacts,
        searchTextChange: searchTextChange,
        selectedContactChange: selectedContactChange,
        querySearch: querySearch,
        fillSendableBalance: fillSendableBalance,
        totalBalance: getTotalBalance(0),
        remainingBalance: getTotalBalance(0) // <-- initial value, this will change by directive
      }

      if (uriScheme) {
        $timeout(() => {
          $scope.send.data.selectedAddress = {address: uriScheme.address}
        }, 0)
      }

      $scope.onQrCodeForToAddressScanned = (address) => {
        // this will trigger the selectedContactChange function, which will then set the toAddress
        $scope.send.data.selectedAddress = {address: address}
      }

      $mdDialog.show({
        parent: angular.element(document.getElementById('app')),
        templateUrl: './src/components/account/templates/send-transaction-dialog.html',
        clickOutsideToClose: false,
        preserveScope: true,
        scope: $scope
      })
    }
  }
})()
