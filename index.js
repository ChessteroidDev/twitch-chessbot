// Configuration du bot.

const CHANNEL_NAME = ''; // Nom de la chaîne twitch ou le bot va se connecter.
const BOT_NAME = ''; // Pseudo twitch du compte du bot.
const BOT_TOKEN = 'oauth:'; // Token du bot. Obtenu en se connectant manuellement sur twitch avec le compte bot, puis en visitant cette page web: https://twitchapps.com/tmi/
const DEBUG_MODE = false; //le mode debug affiche les messages et actions du bot dans la console quand DEBUG_MODE = true.
const STRICT_MODE_TIMEOUT = 600; // Durée par défaut des timeout en mode strict.

// Ne rien toucher à partir d'ici, sauf si vous savez ce que vous faites :)

const tmi = require('tmi.js');

// Variables et fonctions utiles au bot.

let restoreHistory = [], chatHistory = [], timeoutHistory = [], autoDetection = false, strictMode = false, strictTime = STRICT_MODE_TIMEOUT;

function isChessLetter(l) {
	if (l === 'a' || l === 'b' || l === 'c' || l === 'd'|| l === 'e' || l === 'f' || l === 'g' || l === 'h') return true;
	return false;
}

// Création du client et connexion au salon de chat de la chaîne twitch spécifiée dans la configuration, avec les informations de login du bot de la configuration.

const client = new tmi.Client({
	options: { debug: DEBUG_MODE },
	identity: { username: BOT_NAME, password: BOT_TOKEN},
	channels: [CHANNEL_NAME]
});

client.connect();

// Parseur de message

client.on('message', (channel, userstate, message, self) => {

	// Ignore ses propres messages
	if(self) return;

	// Enregistre les messages des utilisateurs du chat autres que ceux des modérateurs et du propriétaire de le chaîne.
	// si la détection automatique est activée, chaque message est inspécté et supprimé automatiquement par le bot pendant cette étape.

	if (userstate.username !== CHANNEL_NAME && !userstate.mod) {
		if (!chatHistory[userstate.username]) chatHistory[userstate.username] = [];
		chatHistory[userstate.username].push([userstate.id, message]);
		if (autoDetection)
		{
			let msg = message.toLowerCase().toString().replaceAll(" ", "");
			for (var i = 1; i < msg.length; i++)
			{
				let value = parseInt(msg.charAt(i));
				if (typeof value === 'number' && value > 0 && value <= 8 && isChessLetter(msg.charAt(i - 1)))
				{
					if (strictMode) {
						client.timeout(channel, userstate.username, strictTime, "Les indices ne sont pas tolérés durant cette partie.")
						.then((data) => {}).catch((err) => { console.log(err); });
						if (timeoutHistory.indexOf(userstate.username) === -1) timeoutHistory.push(userstate.username);
					}
					else
					{
						client.deletemessage(channel, userstate.id).then((data) => {}).catch((err) => { console.log(err); });
						if (!restoreHistory[userstate.username]) restoreHistory[userstate.username] = [];
						restoreHistory[userstate.username].push(message);
						chatHistory[userstate.username].pop();
					}
					break;
				}
			}
		}
	}

	// Gestion des commandes. Le bot vérifie que l'utilisateur est modérateur ou propriétaire de la chaîne avant d'executer une commande.

	if (userstate.mod || userstate.username === CHANNEL_NAME)
	{
		let command = message.toLowerCase().toString().split(' ');

		// commande !timeout : supprime le(s) dernier(s) message(s) contenant des indices. utilisation : !timeout pseudo/@pseudo nombre_de_messages (optionnel, défaut: 1).
		// en mode strict, l'utilisation de la commande devient !timeout pseudo/@pseudo , et bannit l'utilisateur pendant x secondes au lieu de simplement supprimer les messages.

		if (command[0] === '!timeout' && command[1])
		{
			if (strictMode)
			{
				client.timeout(channel, command[1], strictTime, "Les indices ne sont pas tolérés durant cette partie.")
				.then((data) => {}).catch((err) => { console.log(err); });
				if (timeoutHistory.indexOf(command[1]) === -1) timeoutHistory.push(command[1]);
			}
			else
			{
				let msgNumber = 1;
				let userToTimeout = command[1];
				if (userToTimeout.charAt(0) === '@') userToTimeout = userToTimeout.slice(1);
				if (command[2] && typeof parseInt(command[2]) === 'number' && parseInt(command[2]) > 0) msgNumber = parseInt(command[2]);
				if (chatHistory[userToTimeout]) {
					let historyLength = chatHistory[userToTimeout].length;
					if (msgNumber > historyLength) msgNumber = historyLength;
					let index = msgNumber;
					while(index > 0){
						client.deletemessage(channel, chatHistory[userToTimeout][historyLength - index][0])
						.then((data) => {}).catch((err) => { console.log(err); });	
						if (!restoreHistory[userToTimeout]) restoreHistory[userToTimeout] = [];
						restoreHistory[userToTimeout].push(chatHistory[userToTimeout][historyLength - index][1]);
						index--;
					}
					chatHistory[userToTimeout].splice(chatHistory[userToTimeout].length - msgNumber,msgNumber);
				}
			}
		}

		// Commande !afficher : vide l'historique du bot et affiche les messages supprimés pendant les parties.

		if (command[0] === '!display')
		{
			let result = '';
			for (let [usr, usrHistory] of Object.entries(restoreHistory)) {
				result += usr + ' :'
				usrHistory.forEach(element => { result += ' " ' + element + ' "'; });
			}
			client.say(channel, result);
			restoreHistory = [];
			chatHistory = [];
		}

		// Commande !detection : active / désactive la détection automatique des coups d'échecs pendant les parties.
				
		if (command[0] === '!detection')
		{
			autoDetection = !autoDetection;
			if (autoDetection) client.say(channel, "Détection automatique des coups activée. Pas d'indices pendant les parties !");
			else client.say(channel, "Détection automatique des coups désactivée.");
		}
		
		// Command !strict : active / désastive le mode strict, qui timeout les utilisateurs pendant les parties au lieu de supprimer les messages.
		// utilisation : !strict duree_du_timeout (en secondes, optionnel, valeur par défaut : 600)
		// lors de la désactivation du mode !strict (2ème utilisation), tous les utilisateurs ayant été bannis pour suggestion de coups sont débannis.

		if (command[0] === '!strict')
		{
			strictMode = !strictMode;
			if (strictMode) {
				if (command[1] && typeof parseInt(command[1]) === 'number' && parseInt(command[1]) > 0) strictTime = parseInt(command[1]);
				client.say(channel, "Mode strict activé. Les personnes qui donnent des indices seront bannies pendant " + strictTime + " secondes.");
			}
			else {
				timeoutHistory.forEach(element => { client.unban(channel, element).then((data) => {}).catch((err) => { console.log(err); }); });
				client.say(channel, "Mode strict désactivé.");
				timeoutHistory = [];
			}
		}
	}
});
