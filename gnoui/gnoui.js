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
    owners: []
}

// on load
window.addEventListener('load', async () => {
    let res = await sdk.connect();
    updateProvider(res);
    //document.getElementById("connect-button").setAttribute("disabled", "true");
});
function showNewContractOptions() {
    document.getElementById("new-contract-address-box").setAttribute("style", "display: block;");
    document.getElementById("new-contract-address-box").setAttribute("style", "display: block;");
    document.getElementById("switch-new-contract-address").setAttribute("disabled", "true");
}
function switchMultiSigCancel() {
    document.getElementById("new-contract-address-box").setAttribute("style", "display: none;");
    document.getElementById("switch-new-contract-address").removeAttribute("disabled");
}
function switchMultiSig() {
    let newAddress = document.getElementById("new-contract-address").value;
    if (newAddress.length !== 42) {
        document.getElementById('error-box').innerText = "Invalid address";
        return;
    }
    localStorage.setItem(`multisig_${network}`, newAddress);
    window.location.reload();
}
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


function getUriParameters() {
    let url = new URL(window.location.href);
    return new URLSearchParams(url.search);
}

async function setRequiredConfirmations() {
    let confirmations = parseInt(document.getElementById("required-confirmations").value);
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

function updateOwners() {
    for (let i = 0; i < globals.owners.length; i++) {
        let own = globals.owners[i];
        document.getElementById('owners').innerHTML += `<li>${own} - <button onclick="removeOwner('${own}')">Remove</button> </li>`;
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
    } else if (network === "holesky") {
        //return "0x7D7222f0A7d95E43d9D960F5EF6F2E5d2A72aC59";
        return "0x2E9cE37b4d0Ef9385AAf3f32DFE727c41fdcc8DD";
    }
}

async function downloadAbi(network, contractAddress) {
    let abiUrl;
    if (network === "mainnet") {
        abiUrl = `https://api.etherscan.io/api?module=contract&action=getabi&address=${contractAddress}`;
    } else if (network === "holesky") {
        abiUrl = `https://api-holesky.etherscan.io/api?module=contract&action=getabi&address=${contractAddress}`;
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

function createDivWithAddress(address) {
    let className = "address-box";
    let extra = "(Ext)";
    if (globals.owners.includes(address)) {
        className += " address-box-owner";
        extra = "(Own)";
    }
    if (address.to === globals.multiSigAddress) {
        className += " address-box-multi-sig";
        extra = "(Mul)";
    }
    if (address === connected) {
        className += " address-box-connected";
        extra = "(Con)";
    }
    return createDivWithClassAndContent(
        className,
        `<a href="https://holesky.etherscan.io/address/${address}">${extra}-${address}</a>`,
        true
    );
}


/**
 * @param {[string]} owners
 * @param {boolean} isConfirmed
 */
function renderOwnersEntry(owners, isConfirmed) {
    // verify if owners is string array
    if (!Array.isArray(owners) || !owners.every((v) => typeof v === "string")) {
        throw "Owners must be an array of strings";
    };
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
        `details-label transaction-details-header-label`,
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

    let bytes = looseArrayify(data);
    // check if Uint8Array
    if (!bytes instanceof Uint8Array) {
        throw "Data must be Uint8Array";
    }
    let newDiv = document.createElement('div');
    newDiv.className = "transaction-details";

    {
        let parentDiv = document.createElement('div');
        parentDiv.className = "address-box-entry";

        parentDiv.appendChild(createDivWithClassAndContent(
            "details-label transaction-details-header-label",
            "Transaction ID:"));
        parentDiv.appendChild(createDivWithClassAndContent(
            "details-value transaction-details-value",
            `${transactionId}`,
            true
        ));
        newDiv.appendChild(parentDiv);
    }
    let transactionStatus = executed ? "Executed" : "Pending";

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

    newDiv.appendChild(
        renderOwnersEntry(ownersNotConfirmed, false)
    );
    {
        let parentDiv = document.createElement('div');
        parentDiv.className = "address-box-entry";

        parentDiv.appendChild(createDivWithClassAndContent(
            "details-label transaction-details-header-label",
            "Transaction status:"));
        parentDiv.appendChild(createDivWithClassAndContent(
            "details-value transaction-details-value",
            `${transactionStatus}`,
            true
        ));
        newDiv.appendChild(parentDiv);
    }

    let isContractCall = (bytes.length > 0);

    let abi = null;
    let iface = null;
    let func= null;
    let decoded= null;

    if (isContractCall) {
        try {
            abi = await downloadAbi("holesky", targetAddr);
            iface = new Interface(abi);
            func = iface.getFunction(hexlify(bytes.subarray(0, 4)));
            decoded = iface.decodeFunctionData(func, hexlify(bytes));
        } catch (e) {
            console.error("Error decoding function data");
            abi = null;
            iface = null;
            func = null;
            decoded = null;
        }
    }

    {
        let parentDiv = document.createElement('div');
        parentDiv.className = "address-box-entry";

        parentDiv.appendChild(createDivWithClassAndContent(
            "details-label address-box-label",
            "Contract called: "));
        parentDiv.appendChild(createDivWithAddress(targetAddr));

        newDiv.appendChild(parentDiv);
    }
    {
        let parentDiv = document.createElement('div');
        parentDiv.className = "address-box-entry";

        parentDiv.appendChild(createDivWithClassAndContent(
            "details-label address-box-label",
            "Gas (ETH) transferred: "));
        parentDiv.appendChild(createDivWithClassAndContent(
            "details-value ether-amount-box",
            `${formatEther(value)} (${value} wei)`
        ));
        newDiv.appendChild(parentDiv);
    }

    if (func) {
        let fullFuncSig = func.name + "(";
        for (let i = 0; i < func.inputs.length; i++) {
            fullFuncSig += `${func.inputs[i].type},`;
        }
        fullFuncSig = fullFuncSig.slice(0, -1) + ")";
        {
            {
                let parentDiv = document.createElement('div');
                parentDiv.className = "address-box-entry";

                parentDiv.appendChild(createDivWithClassAndContent(
                    "details-label address-box-label",
                    "Function signature: "));
                parentDiv.appendChild(createDivWithClassAndContent(
                    "details-value address-box",
                    `${fullFuncSig}`
                ));
                newDiv.appendChild(parentDiv);
            }
        }
        // Print decoded values and their types
        if (decoded) {
            for (let i = 0; i < decoded.length; i++) {
                let parentDiv = document.createElement('div');
                parentDiv.className = "address-box-entry";

                parentDiv.appendChild(createDivWithClassAndContent(
                    "details-label address-box-label",
                    `Param no ${i + 1}: `));
                parentDiv.appendChild(createDivWithClassAndContent(
                    "details-value param-data-box",
                    `${decoded[i]}`
                ));
                newDiv.appendChild(parentDiv);
            }
        }

    }

    {
        let parentDiv = document.createElement('div');
        parentDiv.className = "address-box-entry";

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

    document.getElementById('div-transaction-list').appendChild(newDiv);




}

async function confirmTransaction(transactionId) {
    let iface = new Interface(gnosisAbi);
    let call = iface.encodeFunctionData("confirmTransaction", [transactionId]);
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


async function get_chain_id() {
    let chainId = await provider.request({ method: 'eth_chainId' });
    console.log(chainId);
    if (parseInt(chainId) === 17000) {
        network = "holesky";
        document.getElementById("connected-network").innerText = "Connected via MetaMask to Holesky testnet:";
    } else if (parseInt(chainId) === 1) {
        network = "mainnet";
        document.getElementById("connected-network").innerText = "Connected via MetaMask to Ethereum Mainnet:";
    } else {
        document.getElementById('error-box').innerText = "Please switch to the correct network";
    }

    let uriParams = getUriParameters();
    if (uriParams.has('multisig') && uriParams.get('multisig').length === 42) {
        localStorage.setItem(`multisig_${network}`, uriParams.get('multisig'));
    }

    globals.multiSigAddress = getMultiSigAddress(network);

    document.getElementById("page-content").setAttribute("style", "display: block;")

    document.getElementById("multisig-address").innerText = globals.multiSigAddress;
    document.getElementById("multisig-address").href = "https://holesky.etherscan.io/address/" + globals.multiSigAddress;

    const contract = new ethers.Contract(globals.multiSigAddress, gnosisAbi, new ethers.BrowserProvider(provider))

    globals.owners = await getOwners(contract);
    updateOwners();
    updateConnected();

    await getTransactionsIds(contract, true);
    await getTransactionsIds(contract, false);
}

function removeOwner(address) {
    let iface = new Interface(gnosisAbi);
    let calldata = iface.encodeFunctionData("removeOwner", [address]);
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
function addOwner() {
    let address = document.getElementById('new-owner-address').value;
    let iface = new Interface(gnosisAbi);
    let calldata = iface.encodeFunctionData("addOwner", [address]);
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

async function sendErc20Token() {
    let tokenAddress = document.getElementById('token-address').value;
    let destinationAddress = document.getElementById('token-dest-address').value;

    let erc20 = new ethers.Contract(tokenAddress, erc20abi, new ethers.BrowserProvider(provider))

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


    if (confirm(confirmStr)) {
        let iface = new Interface(gnosisAbi);
        let erc20iface = new Interface(erc20abi);

        let calldata = erc20iface.encodeFunctionData("transfer", [destinationAddress, bigAmount]);
        let gasLimit = 1000000;
        let gasLimitHex = gasLimit.toString(16);
        let call = iface.encodeFunctionData("submitTransaction", [tokenAddress, 0, calldata]);
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
function sendGasTransfer() {
    let address = document.getElementById('gas-destination-address').value;
    let amount = document.getElementById('gas-transfer-value').value;
    let bigAmount = parseEther(amount);
    let bigAmountHex = '0x' + bigAmount.toString(16);
    // be extra careful with this
    bigAmount = BigInt(bigAmountHex);

    let confirmStr = "Are you sure you want to send \n";
    confirmStr += `${formatEther(bigAmount)} ETH (dec: ${bigAmount.toString()} wei, hex: ${bigAmountHex}) \n`;
    confirmStr += `to ${address}`;
    if (confirm(confirmStr)) {
        let iface = new Interface(gnosisAbi);
        let gasLimit = 1000000;
        let gasLimitHex = gasLimit.toString(16);
        let call = iface.encodeFunctionData("submitTransaction", [address, bigAmount, "0x"]);
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

function updateConnected() {
    let newDiv = createDivWithAddress(connected);
    document.getElementById('connected-address').replaceWith(newDiv);
    newDiv.id = "connected-address";
}

//**
// * @param {Array.} res
function updateProvider(res) {
    if (res.length > 1) {
        document.getElementById('error-box').innerText = "Only one connected account is allowed. Disconnect unused accounts in metamask and try again.";
        console.error("Only one connected account is allowed");
        return;
    }
    provider = sdk.getProvider();

    // normalize address
    connected = getAddress(res[0]);

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
