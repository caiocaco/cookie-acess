document.addEventListener("DOMContentLoaded", () => {
    const campoCookie = document.getElementById("cookieInput");
    const botaoServidor = document.getElementById("serverBtn");
    const resultadoDiv = document.getElementById("result");

    campoCookie?.addEventListener("input", function () {
        const rawValue = this.value.trim();

        // Extrair cookie de diferentes formatos
        let cookieValue = rawValue;

        // 1. Tentar extrair de entre aspas triplas (''')
        const tripleQuotesMatch = rawValue.match(/'''([^']+)'''/);
        if (tripleQuotesMatch) {
            cookieValue = tripleQuotesMatch[1].trim();
        }

        // 2. Tentar extrair de entre ```
        const codeBlockMatch = rawValue.match(/```(?:.*?\n)?([^```]+)```/);
        if (codeBlockMatch && !tripleQuotesMatch) {
            cookieValue = codeBlockMatch[1].trim();
        }

        // 3. Tentar extrair de entre aspas simples
        const singleQuotesMatch = rawValue.match(/'([^']+)'/);
        if (singleQuotesMatch && !tripleQuotesMatch && !codeBlockMatch) {
            cookieValue = singleQuotesMatch[1].trim();
        }

        // 4. Tentar extrair de entre aspas duplas
        const quotesMatch = rawValue.match(/"([^"]+)"/);
        if (quotesMatch && !tripleQuotesMatch && !codeBlockMatch && !singleQuotesMatch) {
            cookieValue = quotesMatch[1].trim();
        }

        // Remover possíveis espaços em branco extras
        cookieValue = cookieValue.trim();

        if (cookieValue.length >= 100) {
            resultadoDiv.innerHTML = "<p style='color: #888888;'>Processando cookie...</p>";

            chrome.runtime.sendMessage({
                action: "setCookie",
                cookieValue: cookieValue
            }, (response) => {
                if (response && response.success) {
                    resultadoDiv.innerHTML = "<p style='color: lightgreen;'>✅ Login realizado! Abrindo Roblox...</p>";
                } else {
                    resultadoDiv.innerHTML = `<p style='color: red;'>❌ Erro: ${response?.error || 'Falha ao processar cookie'}</p>`;
                }
            });
        }
    });

    botaoServidor?.addEventListener("click", () => {
        window.open("https://discord.gg/Nht5JAvcsB", "_blank");
    });
});