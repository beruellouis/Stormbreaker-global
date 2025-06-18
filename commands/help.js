module.exports = {
    name: 'help',
    description: 'Affiche la liste des commandes',
    execute(message) {
        const commands = [...message.client.commands.values()];
        const helpText = commands.map(cmd => `**!${cmd.name}** : ${cmd.description}`).join('\n');
        message.channel.send({
            embeds: [{
                title: '📖 Commandes disponibles',
                description: helpText,
                color: 0x00AE86
            }]
        });
    }
};
