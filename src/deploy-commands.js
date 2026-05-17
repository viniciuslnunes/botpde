require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Registrando ${commands.length} slash command(s)...`);

    // Para registrar globalmente (pode levar até 1 hora para propagar):
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });

    // Para registrar apenas em um servidor (instantâneo — útil em desenvolvimento):
    // await rest.put(
    //   Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    //   { body: commands },
    // );

    console.log(`✅ ${commands.length} slash command(s) registrado(s) com sucesso.`);
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
})();
