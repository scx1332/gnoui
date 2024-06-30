import gzip
import codecs
import os

main_html = codecs.open("gnoui/index.html", "r", "utf-8").read()

extra_scripts = ""


def replace_script(script_name):
    global extra_scripts
    global main_html
    script_entry = f"\n<script> <!-- {script_name} -->\n"
    script_entry += codecs.open(f"gnoui/{script_name}", "r", "utf-8").read()
    script_entry += f"\n</script> <!-- {script_name} -->\n"
    main_html = main_html.replace(f"""<script src="{script_name}"></script>""", script_entry)



def replace_style(style_name):
    global extra_scripts
    global main_html
    style_entry = f"\n<!-- {style_name} --> \n<style>\n"
    style_entry += codecs.open(f"gnoui/{style_name}", "r", "utf-8").read()
    style_entry += f"\n</style> <!-- {style_name} -->\n"
    main_html = main_html.replace(f"""<link rel="stylesheet" href="{style_name}">""", style_entry)



replace_script("ethers.js")
replace_script("gnosis-abi.js")
replace_script("erc20-abi.js")
replace_script("MultiSigWallet_sol.js")
replace_script("gnoui.js")
replace_script("icons.js")


replace_style("gnoui.css")

if not os.path.exists("one"):
    os.makedirs("one")

with codecs.open("one/index.html", "w", "utf-8") as f:
    f.write(main_html)
    f.write(extra_scripts)

with open("one/index.html", "rb") as f:
    compressed = gzip.compress(f.read())
    with open("one/index.html.gzip.hex", "w") as f2:
        # change to hex

        hexed = compressed.hex()
        for i in range(0, len(hexed), 64):
            f2.write(hexed[i:i+64] + "\n")

