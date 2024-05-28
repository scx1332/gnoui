let dappMetadata = {
    name: "Example Pure JS Dapp",
    url: "https://dapptest.com"
};

const sdk = new MetaMaskSDK.MetaMaskSDK(dappMetadata);

let provider;
let connected;

let multisigAddress = "0x7D7222f0A7d95E43d9D960F5EF6F2E5d2A72aC59";


// on load
window.addEventListener('load', async () => {
    let res = await sdk.connect();
    updateProvider(res);
    document.getElementById("connect-button").setAttribute("disabled", "true");
});

function connect() {
    document.getElementById("connect-button").setAttribute("disabled", "true");
    sdk.connect()
        .then((res) => {
             updateProvider(res);
        })
        .catch((e) => {
            console.log('request accounts ERR', e);
            document.getElementById('error-box').innerText = "Error connecting to MetaMask";
            document.getElementById("connect-button").removeAttribute("disabled");
        });
}

async function setRequiredConfirmations() {
    let confirmations = parseInt(document.getElementById("required-confirmations").value);
    let iface = new Interface(gnosisAbi);
    let calldata = iface.encodeFunctionData("changeRequirement", [confirmations]);
    let call = iface.encodeFunctionData("submitTransaction", [multisigAddress, 0, calldata]);
    let params = {
        to: multisigAddress,
        data: calldata
    };
    let gasLimit = 1000000;
    let gasLimitHex = gasLimit.toString(16);
    window.ethereum.request({
        "method": "eth_sendTransaction",
        "params": [
            {
                "to": multisigAddress,
                "from": connected,
                "gas": gasLimitHex,
                "value": "0x0",
                "data": call,
            }
        ]
    });

}

async function getOwners(contract) {
    let owners = [];
    let resp = await contract.getOwners();
    for (let i = 0; i < resp.length; i++) {
        owners.push(resp[i]);
        document.getElementById('owners').innerHTML += `<li>${resp[i]} - <button onclick="removeOwner('${resp[i]}')">Remove</button> </li>`;
    }
}

async function getTransactionsIds(contract, pending) {
    let resp;

    if (pending) {
        let transCount = await contract.getTransactionCount(true, false);
        resp = await contract.getTransactionIds(0, transCount, true, false);
        for (let i = 0; i < resp.length; i++) {
            document.getElementById('pending-transactions').innerHTML += `<li>${resp[i]} - <button>Execute</button> </li>`;
        }
    } else {
        let transCount = await contract.getTransactionCount(false, true);
        resp = await contract.getTransactionIds(0, transCount, false, true);
        for (let i = 0; i < resp.length; i++) {
            document.getElementById('executed-transactions').innerHTML += `<li>Executed: ${resp[i]} </li>`;
            try {
                await getTransactionDetails(contract, resp[i]);
            } catch (e) {
                console.error(e);
            }
        }
    }
    console.log(resp);
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

async function getTransactionDetails(contract, transactionId) {
    let resp = await contract.transactions(transactionId);

    let targetAddr = resp[0];
    let value = resp[1];
    let data = resp[2];
    //data from hex
    let executed = resp[3];

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
    if (bytes.length > 0) {
        let abi = await downloadAbi("holesky", targetAddr);
        let iface = new Interface(abi);
        let func = iface.getFunction(hexlify(bytes.subarray(0, 4)));
        console.log("Called: " + func);
        let decoded = iface.decodeFunctionData(func, hexlify(bytes));
        {
            let div = document.createElement('div');
            div.innerHTML = `Target address: <a href="https://holesky.etherscan.io/address/${targetAddr}">${targetAddr}</a>`;
            newDiv.appendChild(div);
        }
        {
            let div = document.createElement('div');
            div.innerText = `Gas (ETH) transferred: ${value}`;
            newDiv.appendChild(div);
        }
        let fullFuncSig = func.name + "(";
        for (let i = 0; i < func.inputs.length; i++) {
            fullFuncSig += `${func.inputs[i].type},`;
        }
        fullFuncSig = fullFuncSig.slice(0, -1) + ")";
        {
            let div = document.createElement('div');
            div.innerHTML = `Method signature: <span class="function-signature">${fullFuncSig}</span>`;
            newDiv.appendChild(div);
        }
        // Print decoded values and their types
        for (let i = 0; i < decoded.length; i++) {
            {
                let div = document.createElement('div');
                div.className = "decoded-param";
                div.innerText = `Param no ${i + 1} (${func.inputs[i].type}): ${decoded[i]}`;
                newDiv.appendChild(div);
            }
        }
        {
            let div = document.createElement('div');
            div.innerText = `Call data: ${data}`;
            newDiv.appendChild(div);
        }

        document.getElementById('transaction-details').appendChild(newDiv);
    } else {
        {
            let div = document.createElement('div');
            div.innerText = `Target address: ${targetAddr}`;
            newDiv.appendChild(div);
        }
        {
            let div = document.createElement('div');
            div.innerText = `Value: ${value}`;
            newDiv.appendChild(div);
        }
        {
            let div = document.createElement('div');
            div.innerText = `Call data: ${data}`;
            newDiv.appendChild(div);
        }
    }



}




async function get_chain_id() {
    let chainId = await provider.request({ method: 'eth_chainId' });
    console.log(chainId);
    if (parseInt(chainId) === 17000) {
        document.getElementById("connected-network").innerText = "Connected to Holesky network";
    } else {
        document.getElementById('error-box').innerText = "Please switch to the correct network";
    }
    let coder = new AbiCoder();

    document.getElementById("multisig-address").innerText = multisigAddress;
    document.getElementById("multisig-address").href = "https://holesky.etherscan.io/address/" + multisigAddress;
    const contract = new ethers.Contract(multisigAddress, gnosisAbi, new ethers.BrowserProvider(provider))

    await getOwners(contract);
    await getTransactionsIds(contract, true);
    await getTransactionsIds(contract, false);
}

function removeOwner(address) {
    let iface = new Interface(gnosisAbi);
    let calldata = iface.encodeFunctionData("removeOwner", [address]);
    let call = iface.encodeFunctionData("submitTransaction", [multisigAddress, 0, calldata]);
    let params = {
        to: multisigAddress,
        data: calldata
    };
    let gasLimit = 1000000;
    let gasLimitHex = gasLimit.toString(16);
    window.ethereum.request({
        "method": "eth_sendTransaction",
        "params": [
            {
                "to": multisigAddress,
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
    let call = iface.encodeFunctionData("submitTransaction", [multisigAddress, 0, calldata]);
    let params = {
        to: multisigAddress,
        data: calldata
    };
    let gasLimit = 1000000;
    let gasLimitHex = gasLimit.toString(16);
    window.ethereum.request({
        "method": "eth_sendTransaction",
        "params": [
            {
                "to": multisigAddress,
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
                    "to": multisigAddress,
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
                    "to": multisigAddress,
                    "from": connected,
                    "gas": gasLimitHex,
                    "value": "0x0",
                    "data": call,
                }
            ]
        });
    }
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
    connected = res[0];
    provider.on("chainChanged", (chainId) => {
        window.location.reload()
    });
    provider.on("accountsChanged", (accounts) => {
        window.location.reload()
    });
    provider.on("disconnect", (error) => {
        window.location.reload()
    });
    document.getElementById('connected-address').innerText = res;
    let promise = get_chain_id();
    promise.then(() => {
        // do nothing
    });
}
