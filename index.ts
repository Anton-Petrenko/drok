import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { Client, Collection, GatewayIntentBits } from 'discord.js'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const client = new Client({ intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ] });

client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => { return file.endsWith('.js') || file.endsWith('.ts') });
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => { return file.endsWith('.js') || file.endsWith('.ts') });

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		console.log(event.name)
		client.on(event.name, (...args) => event.execute(...args));
	}
}
console.log("Starting Discord bot...");
client.login(DISCORD_BOT_TOKEN);