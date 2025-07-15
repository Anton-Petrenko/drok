"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const discord_js_1 = require("discord.js");
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const client = new discord_js_1.Client({ intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMessages, discord_js_1.GatewayIntentBits.MessageContent] });
client.commands = new discord_js_1.Collection();
const foldersPath = node_path_1.default.join(__dirname, 'commands');
const commandFolders = node_fs_1.default.readdirSync(foldersPath);
for (const folder of commandFolders) {
    const commandsPath = node_path_1.default.join(foldersPath, folder);
    const commandFiles = node_fs_1.default.readdirSync(commandsPath).filter(file => { return file.endsWith('.js') || file.endsWith('.ts'); });
    for (const file of commandFiles) {
        const filePath = node_path_1.default.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        }
        else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}
const eventsPath = node_path_1.default.join(__dirname, 'events');
const eventFiles = node_fs_1.default.readdirSync(eventsPath).filter(file => { return file.endsWith('.js') || file.endsWith('.ts'); });
for (const file of eventFiles) {
    const filePath = node_path_1.default.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    }
    else {
        console.log(event.name);
        client.on(event.name, (...args) => event.execute(...args));
    }
}
console.log("Starting Discord bot...");
client.login(DISCORD_BOT_TOKEN);
