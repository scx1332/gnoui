

let dappMetadata = {
    name: "Example Pure JS Dapp",
    url: "https://dapptest.com"
};

const sdk = new MetaMaskSDK.MetaMaskSDK(dappMetadata);

let provider;

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

async function get_chain_id() {
    let chainId = await provider.request({ method: 'eth_chainId' });
    console.log(chainId);
    if (parseInt(chainId) === 17000) {
        document.getElementById("connected-network").innerText = "Connected to Holesky network";
    } else {
        document.getElementById('error-box').innerText = "Please switch to the correct network";
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
