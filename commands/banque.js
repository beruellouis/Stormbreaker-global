const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const banquePath = path.join(__dirname, '..', 'banque.json');

function getBanque() {
    if (!fs.existsSync(banquePath)) {
        return { total: 0, transactions: [], donateurs: {} };
    }
    return JSON.parse(fs.readFileSync(banquePath));
}

function saveBanque(data) {
    fs.writeFileSync(banquePath, JSON.stringify(data, null, 2));
}

function formatAUEC(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return `0 aUEC`;
    return `${amount.toLocaleString()} aUEC`;
}

module.exports = {
    name: 'banque',
    description: 'Gère la banque Stormbreaker',
    async execute(message, args) {
        const sub = args[0];
        const montant = parseInt(args[1]);
        const banque = getBanque();

        if (!sub || sub === 'total') {
            const top = Object.entries(banque.donateurs || {})
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([id, amt], i) => `${i + 1}. <@${id}> — ${formatAUEC(amt)}`)
                .join('\n') || 'Aucun donateur encore.';

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_donation_modal')
                    .setLabel('💸 Faire un don')
                    .setStyle(ButtonStyle.Primary)
            );

            return message.channel.send({
                embeds: [{
                    title: '🏦 Banque Stormbreaker',
                    description: `💰 Total actuel : **${formatAUEC(banque.total)}**\n\n👑 Top donateurs :\n${top}`,
                    color: 0x2ecc71
                }],
                components: [row]
            });
        }

        if (sub === 'add') {
            if (isNaN(montant) || montant <= 0) {
                return message.reply('❌ Utilisation : `!banque add [montant]`');
            }

            banque.total += montant;
            banque.donateurs[message.author.id] = (banque.donateurs[message.author.id] || 0) + montant;
            banque.transactions.push({
                userId: message.author.id,
                username: message.author.username,
                type: 'add',
                amount: montant,
                timestamp: new Date().toISOString()
            });

            saveBanque(banque);
            return message.reply(`✅ Tu as ajouté **${formatAUEC(montant)}** à la banque.`);
        }

        if (sub === 'remove') {
            if (!message.member.roles.cache.some(r => r.name === 'E-5')) {
                return message.reply('🚫 Seuls les E-5 peuvent retirer des fonds.');
            }

            if (isNaN(montant) || montant <= 0) {
                return message.reply('❌ Utilisation : `!banque remove [montant]`');
            }

            if (banque.total < montant) {
                return message.reply('⚠️ Pas assez de fonds dans la banque.');
            }

            banque.total -= montant;
            banque.transactions.push({
                userId: message.author.id,
                username: message.author.username,
                type: 'remove',
                amount: montant,
                timestamp: new Date().toISOString()
            });

            saveBanque(banque);
            return message.reply(`💸 Tu as retiré **${formatAUEC(montant)}** de la banque.`);
        }

        if (sub === 'top') {
            const top = Object.entries(banque.donateurs || {})
                .sort((a, b) => b[1] - a[1])
                .map(([id, amt], i) => `${i + 1}. <@${id}> — ${formatAUEC(amt)}`)
                .join('\n') || 'Aucun donateur.';

            return message.channel.send({
                embeds: [{
                    title: '👑 Classement des donateurs',
                    description: top,
                    color: 0xf1c40f
                }]
            });
        }

        return message.reply('❌ Commande invalide. Utilise `!banque`, `add`, `remove`, ou `top`.');
    }
};