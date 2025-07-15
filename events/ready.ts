import { ClientEvents, Events } from "discord.js";

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute(client: ClientEvents[Events.ClientReady][0]) {
		console.log(`Ready! Logged in as ${client.user.tag}`);
	},
};
