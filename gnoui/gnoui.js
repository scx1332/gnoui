let dappMetadata = {
    name: "Example Pure JS Dapp",
    url: "https://dapptest.com"
};

const sdk = new MetaMaskSDK.MetaMaskSDK(dappMetadata);

let provider;
let connected;


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
    let multisigAddress = "0x7D7222f0A7d95E43d9D960F5EF6F2E5d2A72aC59";
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

async function get_chain_id() {
    let chainId = await provider.request({ method: 'eth_chainId' });
    console.log(chainId);
    if (parseInt(chainId) === 17000) {
        document.getElementById("connected-network").innerText = "Connected to Holesky network";
    } else {
        document.getElementById('error-box').innerText = "Please switch to the correct network";
    }
    let coder = new AbiCoder();

    let multisigAddress = "0x7D7222f0A7d95E43d9D960F5EF6F2E5d2A72aC59";
    document.getElementById("multisig-address").innerText = multisigAddress;
    document.getElementById("multisig-address").href = "https://holesky.etherscan.io/address/" + multisigAddress;
    const contract = new ethers.Contract(multisigAddress, gnosisAbi, new ethers.BrowserProvider(provider))

    let resp = await contract.getOwners();

    let iface = new Interface(gnosisAbi);

    let calldata = iface.encodeFunctionData("addOwner", ["0xDa6EA3738503C5b73B27cEbD06761183D9A08657"]);

    let call = iface.encodeFunctionData("submitTransaction", [multisigAddress, 0, calldata]);


    //send with metamask

    let tx = {

    };


    console.log(calldata);
    let owners = [];
    for (let i = 0; i < resp.length; i++) {
        owners.push(resp[i]);
        document.getElementById('owners').innerHTML += `<li>${resp[i]} - <button onclick="removeOwner('${resp[i]}')">Remove</button> </li>`;
    }
    console.log(multisigAddress);
    console.log(call);
    let params = {
        to: "0x00fb9cba7a830584976d2add586440fa28208040",
        data: calldata
    };

    console.log(params);
    let gasLimit = 1000000;
    //gaslimit to hex
    let gasLimitHex = gasLimit.toString(16);
    /*await window.ethereum.request({
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
    });*/
    console.log(owners);
}
function removeOwner(address) {
    let multisigAddress = "0x7D7222f0A7d95E43d9D960F5EF6F2E5d2A72aC59";
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
    let multisigAddress = "0x7D7222f0A7d95E43d9D960F5EF6F2E5d2A72aC59";
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
