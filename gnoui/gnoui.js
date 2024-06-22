import {parseEther, getAddress, formatEther, hexlify, Interface, Contract, BrowserProvider, ContractFactory, formatUnits, parseUnits, isAddress, isHexString, AbiCoder} from "./ethers.js";


let verifiedTokens = {
    "mainnet": ["0x7DD9c5Cba05E151C895FDe1CF355C9A1D5DA6429",  //GLM token
        "0xdAC17F958D2ee523a2206206994597C13D831ec7", //USDT token
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" //USDC token
    ],
    "holesky": ["0x8888888815bf4DB87e57B609A50f938311EEd068"]
}

/**
 * This should be in library, I couldn't find it in ethers.js, so I have to write my own
 * @param {string} hexString
 * @type {Uint8Array}
 */
function arrayify(hexString) {
    if (!isHexString(hexString, hexString.length / 2 - 1)) {
        throw "Invalid hex string";
    }
    let arrayLength = hexString.length / 2 - 1;
    // Create a Uint8Array with half the length of the hex string
    let array = new Uint8Array(arrayLength);

    for (let i = 0; i < arrayLength; i += 1) {
        // Convert each pair of hex characters to a byte
        array[i] = parseInt(hexString.substring(i * 2 + 2, i * 2 + 4), 16);
    }

    return array;
}

let dappMetadata = {
    name: "Gnosis simple UI",
    url: "https://gnosis.dev.golem.network"
};

const sdk = new MetaMaskSDK.MetaMaskSDK(dappMetadata);

let provider;
let connected;

let globals = {
    network: "unknown",
    multiSigAddress: null,
    owners: [],
    isAdmin: false,
}

// on load
window.addEventListener('load', async () => {
    update_nav();
    let res = await sdk.connect();

    globals.isAdmin = localStorage.getItem("admin-view") === "true";

    if (globals.isAdmin) {
        document.getElementById("button-admin-view").setAttribute("style", "display: none;");
        document.getElementById("button-simple-view").setAttribute("style", "display: block;");
    } else {
        document.getElementById("button-admin-view").setAttribute("style", "display: block;");
        document.getElementById("button-simple-view").setAttribute("style", "display: none;");
        document.getElementById("div-footer").setAttribute("style", "display: none;");
        document.getElementById("nav-contr-config-btn").setAttribute("style", "display: none;");
        document.getElementById("nav-new-trans-btn").setAttribute("style", "display: none;");
        document.getElementById("nav-new-token-trans-btn").setAttribute("style", "display: none;");
    }
    updateProvider(res);
    //document.getElementById("connect-button").setAttribute("disabled", "true");
});
function showNewContractOptions() {
    document.getElementById("new-contract-address-box").setAttribute("style", "display: block;");
    document.getElementById("new-contract-address-box").setAttribute("style", "display: block;");
    document.getElementById("switch-new-contract-address").setAttribute("disabled", "true");
}
window.showNewContractOptions = showNewContractOptions;

function switchMultiSigCancel() {
    document.getElementById("new-contract-address-box").setAttribute("style", "display: none;");
    document.getElementById("switch-new-contract-address").removeAttribute("disabled");
}
window.switchMultiSigCancel = switchMultiSigCancel;

function switchMultiSig() {
    let newAddress = document.getElementById("new-contract-address").value;
    if (newAddress.length !== 42) {
        document.getElementById('error-box').innerText = "Invalid address";
        return;
    }
    localStorage.setItem(`multisig_${globals.network}`, newAddress);
    window.location.reload();
}
window.switchMultiSig = switchMultiSig;

function connect() {
    //document.getElementById("connect-button").setAttribute("disabled", "true");
    sdk.connect()
        .then((res) => {
             updateProvider(res);
        })
        .catch((e) => {
            console.log('request accounts ERR', e);
            document.getElementById('error-box').innerText = "Error connecting to MetaMask";
            //document.getElementById("connect-button").removeAttribute("disabled");
        });
}
window.connect = connect;


function getUriParameters() {
    let url = new URL(window.location.href);
    return new URLSearchParams(url.search);
}

async function setRequiredConfirmations() {
    let confirmations = parseInt(document.getElementById("input-required-confirmations").value);
    let iface = new Interface(gnosisAbi);
    let calldata = iface.encodeFunctionData("changeRequirement", [confirmations]);
    let call = iface.encodeFunctionData("submitTransaction", [globals.multiSigAddress, 0, calldata]);
    let gasLimit = 1000000;
    let gasLimitHex = gasLimit.toString(16);
    window.ethereum.request({
        "method": "eth_sendTransaction",
        "params": [
            {
                "to": globals.multiSigAddress,
                "from": connected,
                "gas": gasLimitHex,
                "value": "0x0",
                "data": call,
            }
        ]
    });
}
window.setRequiredConfirmations = setRequiredConfirmations;

function updateOwners() {
    for (let i = 0; i < globals.owners.length; i++) {
        let own = globals.owners[i];

        let par = createDivWithClass("owner-address-entry")
        let el = createDivWithAddress(
            `${own}`
        );
        par.appendChild(el);
        par.appendChild(createDivWithClassAndContent(
            "owner-address-entry-remove",
            `<button onclick="removeOwner('${own}')">Remove</button>`,
            true
        ));

        document.getElementById('owners-list-ul').appendChild(par);
    }
}

async function getOwners(contract) {
    let resp = await contract.getOwners();
    // verify if resp is array of addresses
    if (!Array.isArray(resp) || !resp.every((v) => isAddress(v))) {
        throw "Owners must be an array of strings";
    }
    return resp;
}

async function getTransactionsIds(contract, pending) {
    let resp;

    let lastTransactionCount = 10;
    if (pending) {
        let transCount = await contract.transactionCount();
        transCount = parseInt(transCount.toString());
        let firstIdx = Math.max(transCount - lastTransactionCount, 0);
        resp = await contract.getTransactionIds(firstIdx, transCount, true, true);
        let reversed = resp.toArray().reverse();
        if (reversed.length == 0) {
            document.getElementById("div-no-transaction-history-list").setAttribute("style", "display: block;");
            document.getElementById("div-no-transaction-history-list").innerText = "Contract does not have any transactions registered yet";
        }
        for (let el of reversed) {
            console.log("Pending transaction: " + el);
            try {
                await getTransactionDetails(contract, el);
            } catch (e) {
                console.error(e);
            }
        }
    }
    console.log(resp);
}

function getMultiSigAddress(network) {
    let localStorageKey = `multisig_${network}`;
    let localStorageItem = localStorage.getItem(localStorageKey);
    if (localStorageItem) {
        return getAddress(localStorageItem.toLowerCase());
    }
    return "0x0000000000000000000000000000000000000000";
}

async function downloadAbi(network, contractAddress) {
    let abiUrl;
    if (globals.etherscanApi) {
        abiUrl = `${globals.etherscanApi}/api?module=contract&action=getabi&address=${contractAddress}`;
    } else {
        console.error(`Invalid network ${network}`);
        return;
    }

    let localStorageKey = `abi_${network}_${contractAddress}`;
    let localStorageItem = localStorage.getItem(localStorageKey);
    if (localStorageItem) {
        return localStorageItem;
    }

    for (let i = 0; i < 3; i++) {
        let response = await fetch(abiUrl);
        if (response.status !== 200) {
            console.error("Error fetching ABI");
        } else {
            let abi = await response.json();
            if (abi.message && abi.message.includes("Invalid API key")) {
                console.warn("Rate limit exceeded trying again");
            }
            let abiJson = JSON.parse(abi["result"]);
            let abiString = JSON.stringify(abiJson, null, 2);
            console.log("Success downloading ABI: " + abiString);
            localStorage.setItem(localStorageKey, abiString);
            return abiString;
        }
    }
}


function createDivWithClass(className) {
    let div = document.createElement('div');
    div.className = className;
    return div;
}

function createDivWithClassAndContent(className, content, isHTML = false) {
    let div = document.createElement('div');
    div.className = className;
    if (isHTML) {
        div.innerHTML = content;
    } else {
        div.innerText = content;
    }
    return div;
}

function createDivWithAddress(address, needSafe=false) {
    let className = "address-box";
    let extra = "(Ext)";


    if (globals.owners.includes(address)) {
        className += " address-box-owner";
        extra = "(Own)";
    }
    if (address === globals.multiSigAddress) {
        className += " address-box-multi-sig";
        extra = "(Mul)";
    } else {
        if (needSafe) {
            let isContractVerified = false;
            if (globals.network in verifiedTokens) {
                if (verifiedTokens[globals.network].includes(address)) {
                    isContractVerified = true;
                }
            }
            if (isContractVerified && needSafe) {
                className += " address-box-verified";
                extra = "(Safe)";
            } else {
                className += " address-box-unsafe";
                extra = "(!Unsafe!)";
            }
        }
    }
    if (address === connected) {
        className += " address-box-connected";
        extra = "(Con)";
    }
    return createDivWithClassAndContent(
        className,
        `<a target="_blank" href="${globals.etherscan}/address/${address}">${extra}-${address}</a>`,
        true
    );
}

function renderDetailsEntry(labelClass, labelText, valueClass, valueText) {
    let entryDiv = document.createElement('div');
    entryDiv.className = "address-box-entry";

    entryDiv.appendChild(createDivWithClassAndContent(
        `details-label ${labelClass}`,
        labelText));
    entryDiv.appendChild(createDivWithClassAndContent(
        `details-value ${valueClass}`,
        valueText
    ));
    return entryDiv;
}


/**
 * @param {[string]} owners
 * @param {boolean} isConfirmed
 */
function renderOwnersEntry(owners, isConfirmed) {
    // verify if owners is string array
    if (!Array.isArray(owners) || !owners.every((v) => typeof v === "string")) {
        throw "Owners must be an array of strings";
    }
    // verify if every string is an address
    if (!owners.every((v) => isAddress(v))) {
        throw "Every owner must be an address";
    }
    // verify if isConfirmed is boolean
    if (typeof isConfirmed !== "boolean") {
        throw "isConfirmed must be a boolean";
    }

    let entryDiv = document.createElement('div');
    entryDiv.className = "address-box-entry";

    entryDiv.appendChild(createDivWithClassAndContent(
        `details-label`,
        isConfirmed ? "Confirmed by:" : "Not (yet) confirmed by:"));

    let div = createDivWithClass('div', "details-value transaction-details-value");
    for (let owner of owners) {
        div.appendChild(createDivWithAddress(owner));
    }
    entryDiv.appendChild(div);
    return entryDiv;
}

async function getTransactionDetails(contract, transactionId) {
    let resp = await contract.transactions(transactionId);

    if (typeof resp[0] !== "string" || !isAddress(resp[0])) {
        throw "Invalid target address";
    }
    const targetAddr = getAddress(resp[0]);

    let isContractVerified = false;
    if (globals.network in verifiedTokens) {
        if (verifiedTokens[globals.network].includes(targetAddr)) {
            isContractVerified = true;
        }
    }

    if (typeof resp[1] !== "bigint") {
        throw "Invalid value returned from contract";
    }
    const value = resp[1];

    if (typeof resp[2] !== "string") {
        throw "Invalid data";
    }
    if (!isHexString(resp[2], resp[2].length / 2 - 1)) {
        throw "Data returned from contract is not a hex string";
    }
    const data = resp[2];

    if (typeof resp[3] !== "boolean") {
        throw "Invalid executed";
    }
    const executed = resp[3];

    console.log("Transaction details: " + targetAddr + " " + value + " " + data + " " + executed);
    if (!data.startsWith('0x')) {
        throw "Data must start with 0x";
    }

    let bytes = arrayify(data);
    // check if Uint8Array
    if (!bytes instanceof Uint8Array) {
        throw "Data must be Uint8Array";
    }
    let newDiv = document.createElement('div');
    newDiv.className = "transaction-details";

    let transactionStatus = executed ? "Executed" : "Pending";
    {
        let parentDiv = document.createElement('div');
        parentDiv.className = "address-box-entry";

        parentDiv.appendChild(createDivWithClassAndContent(
            "details-label transaction-details-header-label",
            "Transaction ID/status:"));
        parentDiv.appendChild(createDivWithClassAndContent(
            "details-value transaction-details-value",
            `${transactionId} - ${transactionStatus}`,
            true
        ));
        newDiv.appendChild(parentDiv);
    }

    let ownersAlreadyConfirmed = [];
    let ownersNotConfirmed = [];

    let confirmedOwners = await contract.getConfirmations(transactionId);
    // check if confirmedOwners is bigint array
    if (!confirmedOwners.every((v) => isAddress(v))) {
        throw "Confirmed owners must be an array with valid addresses";
    }
    for (let i = 0; i < globals.owners.length; i++) {
        let testOwner = globals.owners[i];
        if (confirmedOwners.includes(testOwner)) {
            ownersAlreadyConfirmed.push(globals.owners[i]);
        } else {
            ownersNotConfirmed.push(globals.owners[i]);
        }
    }

    newDiv.appendChild(
        renderOwnersEntry(ownersAlreadyConfirmed, true)
    );

    if (!executed) {
        newDiv.appendChild(
            renderOwnersEntry(ownersNotConfirmed, false)
        );
    }

    let isContractCall = (bytes.length > 0);

    let abi = null;
    let iface = null;
    let func= null;
    let decoded= null;

    if (isContractCall) {
        //try {
            abi = await downloadAbi("holesky", targetAddr);
            iface = new Interface(abi);
            func = iface.getFunction(hexlify(bytes.subarray(0, 4)));
            decoded = iface.decodeFunctionData(func, hexlify(bytes));
        /*} catch (e) {
            console.error(`Error decoding function data: ${e}`);
            abi = null;
            iface = null;
            func = null;
            decoded = null;
        }*/
    }

    {
        let parentDiv = document.createElement('div');
        parentDiv.className = "address-box-entry";

        if (isContractCall) {
            if (executed) {
                parentDiv.appendChild(createDivWithClassAndContent(
                    "details-label address-box-label",
                    "Contract called: "));
            } else {
                parentDiv.appendChild(createDivWithClassAndContent(
                    "details-label address-box-label",
                    "Contract to call: "));
            }

            parentDiv.appendChild(createDivWithAddress(targetAddr, true));
        } else {
            parentDiv.appendChild(createDivWithClassAndContent(
                "details-label address-box-label",
                "Target address: "));
            parentDiv.appendChild(createDivWithAddress(targetAddr));
        }

        newDiv.appendChild(parentDiv);
    }
    {
        let parentDiv = document.createElement('div');
        parentDiv.className = "address-box-entry";

        if (executed) {
            parentDiv.appendChild(createDivWithClassAndContent(
                "details-label address-box-label",
                "Gas (ETH) transferred: "));
        } else {
            parentDiv.appendChild(createDivWithClassAndContent(
                "details-label address-box-label",
                "Gas (ETH) to transfer: "));
        }
        parentDiv.appendChild(createDivWithClassAndContent(
            "details-value ether-amount-box",
            `${formatEther(value)} (${value} wei)`
        ));
        newDiv.appendChild(parentDiv);
    }
    if (!isContractCall) {
        newDiv.appendChild(renderDetailsEntry(
            "function-signature-label",
            "Function signature:",
            "function-signature-box",
            `No function call (pure ETH transfer)`
        ));

    } else if (func && decoded != null) {
        let fullFuncSig = func.name + "(" + func.inputs.map(input => input.type).join(",") + ")";
        if (fullFuncSig == "transfer(address,uint256)") {
            let contract = new Contract(targetAddr, erc20abi, new BrowserProvider(provider));

            let decimalPlaces = await contract.decimals();
            let tokenName = await contract.name();
            let tokenSymbol = await contract.symbol();
            newDiv.appendChild(renderDetailsEntry(
                "function-signature-label",
                "ERC20 transfer:",
                "function-signature-box",
                `Token: ${tokenName} (${tokenSymbol})\nFrom ${globals.multiSigAddress} \nTo: ${decoded[0]} \nAmount: ${formatUnits(decoded[1], decimalPlaces)} ${tokenSymbol}`
            ));
        }
        newDiv.appendChild(renderDetailsEntry(
            "function-signature-label",
            "Function signature:",
            "function-signature-box",
            `${fullFuncSig}`
        ));
        // Print decoded values and their types
        for (let i = 0; i < decoded.length; i++) {
            newDiv.appendChild(renderDetailsEntry(
                "param-data-label",
                `Param no ${i + 1}:`,
                "param-data-box",
                `${decoded[i]}`
            ));
        }
    } else {
        {
            newDiv.appendChild(renderDetailsEntry(
                "address-box-label",
                "Function signature:",
                "error-signature-box",
                "CAUTION, No ABI decoded!"
            ));
        }
    }

    {
        let parentDiv = document.createElement('div');
        parentDiv.className = "address-box-entry-last";

        parentDiv.appendChild(createDivWithClassAndContent(
            "details-label address-box-label",
            "Full call data:"));
        parentDiv.appendChild(createDivWithClassAndContent(
            "details-value call-data-box",
            `${data}`,
            true
        ));
        newDiv.appendChild(parentDiv);
    }

    if (!executed && globals.owners.includes(connected) && ownersNotConfirmed.includes(connected)) {
        let parentDiv = document.createElement('div');
        parentDiv.className = "address-box-entry";

        parentDiv.appendChild(createDivWithClassAndContent(
            "details-label address-box-label",
            `<button id="confirm-transaction-no-${transactionId}" onclick="confirmTransaction(${transactionId})">Confirm transaction ${transactionId}</button>`, true));
        newDiv.appendChild(parentDiv);
    }
    if (!executed) {
        document.getElementById("div-no-transaction-pending-list").setAttribute("style", "display: none;");
        document.getElementById('div-transaction-pending-list').appendChild(newDiv);
    } else {
        document.getElementById("div-no-transaction-history-list").setAttribute("style", "display: none;");
        document.getElementById('div-transaction-history-list').appendChild(newDiv);
    }
}

async function confirmTransaction(transactionId) {
    let iface = new Interface(gnosisAbi);
    let call = iface.encodeFunctionData("confirmTransaction", [transactionId]);
    let gasLimitHex = await estimateMultiSigMethod(new BrowserProvider(provider), call);

    window.ethereum.request({
        "method": "eth_sendTransaction",
        "params": [
            {
                "to": globals.multiSigAddress,
                "from": connected,
                "gas": gasLimitHex,
                "value": "0x0",
                "data": call,
            }
        ]
    });
}
window.confirmTransaction = confirmTransaction;


async function get_chain_id() {
    let chainId = await provider.request({ method: 'eth_chainId' });
    console.log(chainId);
    document.getElementById("metamask-not-connected-div").setAttribute("style", "display: none;")
    if (parseInt(chainId) === 17000) {
        globals.network = "holesky";
        globals.ethSymbol = "tETH";
        globals.etherscan = "https://holesky.etherscan.io";
        globals.etherscanApi = "https://api-holesky.etherscan.io";
        document.getElementById("connected-network").innerText = "Connected via MetaMask to Holesky testnet:";
    } else if (parseInt(chainId) === 1) {
        globals.network = "mainnet";
        globals.ethSymbol = "ETH";
        globals.etherscan = "https://etherscan.io";
        globals.etherscanApi = "https://api.etherscan.io";
        document.getElementById("connected-network").innerText = "Connected via MetaMask to Ethereum Mainnet:";
    } else if (parseInt(chainId) === 137) {
        globals.network = "polygon";
        globals.ethSymbol = "MATIC";
        globals.etherscan = "https://polygonscan.com";
        globals.etherscanApi = "https://api.polygonscan.com";
        document.getElementById("connected-network").innerText = "Connected via MetaMask to Polygon (POS) network:";
    }
    else if (parseInt(chainId) === 11155111) {
        globals.network = "sepolia";
        globals.ethSymbol = "tETH";
        globals.etherscan = "https://sepolia.etherscan.io";
        globals.etherscanApi = "https://api-sepolia.etherscan.io";
        document.getElementById("connected-network").innerText = "Connected via MetaMask to Sepolia testnet:";
    }
    else if (parseInt(chainId) === 80002) {
        globals.network = "amoy";
        globals.ethSymbol = "tETH";
        globals.etherscan = "https://amoy.polygonscan.com";
        globals.etherscanApi = "https://api-amoy.polygonscan.com";
        document.getElementById("connected-network").innerText = "Connected via MetaMask to Polygon amoy testnet:";
    }
    else if (parseInt(chainId) === 8453) {
        globals.network = "base";
        globals.ethSymbol = "ETH";
        globals.etherscan = "https://basescan.org";
        globals.etherscanApi = "https://api.basescan.org";
        document.getElementById("connected-network").innerText = "Connected via MetaMask to Base network:";
    }
    else if (parseInt(chainId) === 84532) {
        globals.network = "base-sepolia";
        globals.ethSymbol = "tETH";
        globals.etherscan = "https://sepolia.basescan.org";
        globals.etherscanApi = "https://api-sepolia.basescan.org";
    }
    else if (parseInt(chainId) === 56) {
        globals.network = "binance";
        globals.ethSymbol = "BNB";
        globals.etherscan = "https://bscscan.com";
        globals.etherscanApi = "https://api.bscscan.com";
    }
    else if (parseInt(chainId) === 42161) {
        globals.network = "arbitrum";
        globals.ethSymbol = "BNB";
        globals.etherscan = "https://arbiscan.io";
        globals.etherscanApi = "https://api.arbiscan.io";
    }
    else {
        document.getElementById('error-box').innerText = "Please switch to the correct network";
    }

    let uriParams = getUriParameters();
    if (uriParams.has('multisig') && uriParams.get('multisig').length === 42) {
        localStorage.setItem(`multisig_${globals.network}`, uriParams.get('multisig'));
    }


    globals.multiSigAddress = getMultiSigAddress(globals.network);


    document.getElementById("multisig-address").innerText = globals.multiSigAddress;
    document.getElementById("multisig-address").href = `${globals.etherscan}/address/` + globals.multiSigAddress;

    try {
        const contract = new Contract(globals.multiSigAddress, gnosisAbi, new BrowserProvider(provider))

        globals.owners = await getOwners(contract);
        globals.requiredConfirmations = await contract.required();
        document.getElementById("input-required-confirmations").value = globals.requiredConfirmations;
        updateOwners();
        updateConnected();
        if (uriParams.has('nav')) {
            localStorage.setItem("current-nav-item", uriParams.get('nav'));
        }
        update_nav();
        document.getElementById("page-content-1").setAttribute("style", "display: block;")
        document.getElementById("page-content-2").setAttribute("style", "display: block;")
        document.getElementById("page-content-3").setAttribute("style", "display: block;")

        await getTransactionsIds(contract, true);
        await getTransactionsIds(contract, false);
    } catch (e) {
        console.error(e);
        document.getElementById('error-box').innerText = "Error fetching contract details";
        document.getElementById("page-content-1").setAttribute("style", "display: block;")
        document.getElementById("page-content-2").setAttribute("style", "display: block;")
        document.getElementById("page-content-3").setAttribute("style", "display: block;")
    }

}

async function removeOwner(address) {
    let iface = new Interface(gnosisAbi);
    let calldata = iface.encodeFunctionData("removeOwner", [address]);
    let call = iface.encodeFunctionData("submitTransaction", [globals.multiSigAddress, 0, calldata]);
    let gasLimitHex = await estimateMultiSigMethod(new BrowserProvider(provider), call);

    window.ethereum.request({
        "method": "eth_sendTransaction",
        "params": [
            {
                "to": globals.multiSigAddress,
                "from": connected,
                "gas": gasLimitHex,
                "value": "0x0",
                "data": call,
            }
        ]
    });
}
window.removeOwner = removeOwner;

async function addOwner() {
    let address = document.getElementById('new-owner-address').value;
    let iface = new Interface(gnosisAbi);
    let calldata = iface.encodeFunctionData("addOwner", [address]);
    let call = iface.encodeFunctionData("submitTransaction", [globals.multiSigAddress, 0, calldata]);
    let gasLimitHex = await estimateMultiSigMethod(new BrowserProvider(provider), call);

    window.ethereum.request({
        "method": "eth_sendTransaction",
        "params": [
            {
                "to": globals.multiSigAddress,
                "from": connected,
                "gas": gasLimitHex,
                "value": "0x0",
                "data": call,
            }
        ]
    });
}
window.addOwner = addOwner;

async function sendCustomTransaction() {
    let destContract = document.getElementById('any-contract-address').value;
    let anyData = document.getElementById('any-contract-data').value;
    let anyValue = document.getElementById('any-contract-value').value;
    let bigAmount = parseEther(anyValue);
    let bigAmountHex = '0x' + bigAmount.toString(16);
    bigAmount = BigInt(bigAmountHex);

    let bytes = arrayify(anyData);
    let abi = await downloadAbi("holesky", destContract);
    let iface = new Interface(abi);
    let func = iface.getFunction(hexlify(bytes.subarray(0, 4)));
    let decoded = iface.decodeFunctionData(func, hexlify(bytes));

    let confirmStr = "Are you sure you want to send \n";
    confirmStr += `to ${destContract} \n`;
    confirmStr += `value: ${bigAmount} \n`;
    confirmStr += `function: ${func.name}(${func.inputs.map(input => input.type).join(",")}) \n`;
    confirmStr += `decoded: ${decoded}`;

    let call = (new Interface(gnosisAbi)).encodeFunctionData(
        "submitTransaction",
        [destContract, bigAmount, bytes]);
    let gasLimitHex = await estimateMultiSigMethod(new BrowserProvider(provider), call);

    if (confirm(confirmStr)) {

        window.ethereum.request({
            "method": "eth_sendTransaction",
            "params": [
                {
                    "to": globals.multiSigAddress,
                    "from": connected,
                    "gas": gasLimitHex,
                    "value": "0x0",
                    "data": call,
                }
            ]
        });
    }
}
window.sendCustomTransaction = sendCustomTransaction;

async function sendErc20Token() {
    let tokenAddress = document.getElementById('token-address').value;
    let destinationAddress = document.getElementById('token-dest-address').value;

    let erc20 = new Contract(tokenAddress, erc20abi, new BrowserProvider(provider))

    let tokenName = await erc20.name();
    let tokenSymbol = await erc20.symbol();
    let decimalPlaces = await erc20.decimals();

    let amount = document.getElementById('token-transfer-value').value;

    let bigAmount = parseUnits(amount, decimalPlaces);
    let bigAmountHex = '0x' + bigAmount.toString(16);
    bigAmount = BigInt(bigAmountHex);


    let confirmStr = "Are you sure you want to send \n";
    confirmStr += `token (${tokenName} (${tokenSymbol}), decimals: ${decimalPlaces}, address: ${tokenAddress}) \n`;
    confirmStr += `${formatUnits(bigAmount, decimalPlaces)} ${tokenSymbol} (dec: ${bigAmount.toString()}, hex: ${bigAmountHex}) \n`;
    confirmStr += `to ${destinationAddress}`;

    let iface = new Interface(gnosisAbi);
    let erc20iface = new Interface(erc20abi);

    let calldata = erc20iface.encodeFunctionData("transfer", [destinationAddress, bigAmount]);

    let call = iface.encodeFunctionData("submitTransaction", [tokenAddress, 0, calldata]);
    let gasLimitHex = await estimateMultiSigMethod(new BrowserProvider(provider), call);

    if (confirm(confirmStr)) {
        window.ethereum.request({
            "method": "eth_sendTransaction",
            "params": [
                {
                    "to": globals.multiSigAddress,
                    "from": connected,
                    "gas": gasLimitHex,
                    "value": "0x0",
                    "data": call,
                }
            ]
        });
    }
}
window.sendErc20Token = sendErc20Token;


async function estimateMultiSigMethod(prov, callData) {
    let gasLimit = await prov.send(
        'eth_estimateGas',
        [{
            "to": globals.multiSigAddress,
            "from": connected,
            "value": "0x0",
            "data": callData,
        }]
    );
    gasLimit = parseInt(gasLimit, 16) + 60000;
    let gasLimitHex = gasLimit.toString(16);
    return gasLimitHex;
}


async function sendGasTransfer() {
    let address = document.getElementById('gas-destination-address').value;
    let amount = document.getElementById('gas-transfer-value').value;
    let bigAmount = parseEther(amount);
    let bigAmountHex = '0x' + bigAmount.toString(16);
    // be extra careful with this
    bigAmount = BigInt(bigAmountHex);

    let confirmStr = "Are you sure you want to send \n";
    confirmStr += `${formatEther(bigAmount)} ETH (dec: ${bigAmount.toString()} wei, hex: ${bigAmountHex}) \n`;
    confirmStr += `to ${address}`;


    let iface = new Interface(gnosisAbi);
    let call = iface.encodeFunctionData("submitTransaction", [address, bigAmount, "0x"]);

    let gasLimitHex = await estimateMultiSigMethod(new BrowserProvider(provider), call);

    if (confirm(confirmStr)) {
        window.ethereum.request({
            "method": "eth_sendTransaction",
            "params": [
                {
                    "to": globals.multiSigAddress,
                    "from": connected,
                    "gas": gasLimitHex,
                    "value": "0x0",
                    "data": call,
                }
            ]
        });
    }
}
window.sendGasTransfer = sendGasTransfer;

function updateConnected() {
    let newDiv = createDivWithAddress(connected);
    document.getElementById('connected-address').replaceWith(newDiv);
    newDiv.id = "connected-address";
}

function connectedAccountChanged() {
    let address = document.getElementById("connected-addresses").value;
    localStorage.setItem("last-connected-address", address);
    window.location.reload();
}
window.connectedAccountChanged = connectedAccountChanged;

//**
// * @param {Array.} res
function updateProvider(res) {
    let lastConnected = localStorage.getItem("last-connected-address");
    let selectedIndex = 0;
    if (res.length >= 1) {
        document.getElementById("connected-addresses").innerHTML = "";
        for (let i = 0; i < res.length; i++) {
            let par = document.createElement("option");
            par.value = res[i];
            par.innerText = res[i];
            if (lastConnected === res[i]) {
                par.selected = true;
                selectedIndex = i;
            }
            document.getElementById("connected-addresses").appendChild(par);
        }
        if (res.length > 1) {
            document.getElementById("connected-addresses").setAttribute("style", "display: block;");
        } else {
            document.getElementById("connected-addresses").setAttribute("style", "display: none;");
        }
    } else {
        return;
    }
    provider = sdk.getProvider();

    // normalize address
    connected = getAddress(res[selectedIndex]);

    provider.on("chainChanged", (chainId) => {
        console.error(`MetaMask chain changed ${chainId}`);
        window.location.reload()
    });
    provider.on("accountsChanged", (accounts) => {
        console.error(`MetaMask accounts changed ${accounts}`);
        window.location.reload()
    });
    provider.on("disconnect", (error) => {
        console.error(`MetaMask disconnected ${error}`);
        window.location.reload()
    });

    console.log('Connected to: ', connected);

    let promise = get_chain_id();
    promise.then(() => {
        // do nothing
    });
}

function set_selected_nav(navItem) {
    document.getElementById("nav-trans-pending-list-btn").removeAttribute("class");
    document.getElementById("nav-trans-history-list-btn").removeAttribute("class");
    document.getElementById("nav-contr-config-btn").removeAttribute("class");
    document.getElementById("nav-new-trans-btn").removeAttribute("class");
    document.getElementById("nav-new-token-trans-btn").removeAttribute("class");
    document.getElementById("nav-new-eth-trans-btn").removeAttribute("class");

    document.getElementById("nav-obj-new-transaction").setAttribute("style", "display: none;");
    document.getElementById("nav-obj-new-eth-transaction").setAttribute("style", "display: none;");
    document.getElementById("nav-obj-new-token-transaction").setAttribute("style", "display: none;");
    document.getElementById("nav-obj-ownership-management").setAttribute("style", "display: none;");
    document.getElementById("nav-obj-transaction-pending-list").setAttribute("style", "display: none;");
    document.getElementById("nav-obj-transaction-history-list").setAttribute("style", "display: none;");

    if (!globals.isAdmin && (navItem == "config" || navItem == "token" || navItem == "trans")) {
        nav_to("list-pending");
        return;
    }


    if (navItem == "list-pending") {
        document.getElementById("nav-trans-pending-list-btn").setAttribute("class", "nav-selected");
        document.getElementById("nav-obj-transaction-pending-list").setAttribute("style", "display: block;");
    } else if (navItem == "list-history") {
        document.getElementById("nav-trans-history-list-btn").setAttribute("class", "nav-selected");
        document.getElementById("nav-obj-transaction-history-list").setAttribute("style", "display: block;");
    } else if (navItem == "config") {
        document.getElementById("nav-contr-config-btn").setAttribute("class", "nav-selected");
        document.getElementById("nav-obj-ownership-management").setAttribute("style", "display: block;");
    } else if (navItem == "trans") {
        document.getElementById("nav-new-trans-btn").setAttribute("class", "nav-selected");
        document.getElementById("nav-obj-new-transaction").setAttribute("style", "display: block;");
    } else if (navItem == "token") {
        document.getElementById("nav-new-token-trans-btn").setAttribute("class", "nav-selected");
        document.getElementById("nav-obj-new-token-transaction").setAttribute("style", "display: block;");
    } else if (navItem == "eth") {
        document.getElementById("nav-new-eth-trans-btn").setAttribute("class", "nav-selected");
        document.getElementById("nav-obj-new-eth-transaction").setAttribute("style", "display: block;");
    } else {
        localStorage.clear();
        console.error("Invalid nav item" + navItem);
        throw "Invalid nav item - reload page to try again";
    }
}

function update_nav() {
    //get from uri


    let navItem = localStorage.getItem("current-nav-item");
    if (navItem) {
        try {
            set_selected_nav(navItem);
        } catch (e) {
            if (e == "Invalid nav item") {
                console.error("Invalid nav item in local storage");
                localStorage.setItem("current-nav-item", "list");

                set_selected_nav("list-pending");
            }
        }
    } else {
        set_selected_nav("list-pending");
    }

}
function nav_to(page) {
    localStorage.setItem("current-nav-item", page);
    update_nav();
    return false;
}
window.nav_to = nav_to;

function clearAllSettings() {
    if (confirm("Are you sure you want to clear all settings including metamask connection info?")) {
        localStorage.clear();
        window.location.reload();
    }
}

window.clearAllSettings = clearAllSettings;

function useDeployedContract() {
    let contract = document.getElementById("input-deploy-last-contract-address").getAttribute("value");
    localStorage.setItem(`multisig_${globals.network}`, contract);
    window.location = getBaseAddress(window.location.href);
}

window.useDeployedContract = useDeployedContract;

function enableAdminView() {
    localStorage.setItem("admin-view", "true");
    window.location.reload();
}
function enableSimpleView() {
    localStorage.removeItem("admin-view");
    window.location.reload();
}
window.enableAdminView = enableAdminView;
window.enableSimpleView = enableSimpleView;

function getBaseAddress(uri) {
    let url = new URL(uri);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
}

function saveAddressToClipboard() {
    let address = document.getElementById("multisig-address").innerText;
    navigator.clipboard.writeText(getBaseAddress(window.location.href) + "?multisig=" + address);
    alert("Address copied to clipboard");
}
window.saveAddressToClipboard = saveAddressToClipboard;

async function deployNewContract() {
    const factory = new ContractFactory(gnosisAbi, arrayify(gnosisCompiled));
    const txDeploy = await factory.getDeployTransaction([connected], 1);

    txDeploy.from = connected;

    let tx = await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [txDeploy],
    });
    document.getElementById("div-deploy-progress").innerText = `Deploying contract, tx: ${tx} ...`;

    console.log(`Tx data: ${tx}`);

    let receipt = await (new BrowserProvider(provider)).waitForTransaction(tx);
    let contractAddress = receipt.contractAddress;
    console.log(`Contract deployed at ${contractAddress}`);
    document.getElementById("div-deploy-progress").innerText = `Contract deployed at ${contractAddress}`;
    document.getElementById("input-deploy-last-contract-address").setAttribute("value", contractAddress);
    document.getElementById("button-set-deployed-contract").setAttribute("style", "display: block;");

}
window.deployNewContract = deployNewContract;