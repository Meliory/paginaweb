import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, set, push, onValue, off, remove, update } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyAisVxuIXM6Ad2YhCTXj8iJJE-Sf1fA-RY",
  authDomain: "hombres-lobo-db.firebaseapp.com",
  databaseURL: "https://hombres-lobo-db-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "hombres-lobo-db",
  storageBucket: "hombres-lobo-db.firebasestorage.app",
  messagingSenderId: "313489013811",
  appId: "1:313489013811:web:e6f6b8c0135e6450927746"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

window.firebase = { database, ref, set, update, remove, onValue, off };
window.gameState = () => ({ currentGame, playerID, playerName, isHost });

let gameData = null; // Variable para almacenar los datos del juego actual

let playerID = null;
let playerName = null;
let isHost = false;
let currentGame = null;
let gameListener = null;
let joinedLobby = false;
let createdLobby = false;

let gameconfiguration = null;
let roleAssignment = {};

// Configuración del timeout
const ROOM_TIMEOUT_MINUTES = 30;
const HEARTBEAT_INTERVAL_SECONDS = 60; // Cada minuto
const CLEANUP_CHECK_INTERVAL_SECONDS = 120; // Cada 2 minutos

// Variables globales para los timers
let heartbeatTimer = null;
let cleanupTimer = null;

async function updateRoomHeartbeat() {
    if (!currentGame || !isHost) {
        return; // Solo el host actualiza el heartbeat
    }

    try {
        const now = Date.now();
        await update(ref(database, `games/${currentGame}`), {
            lastActivity: now
        });
    } catch (error) {
        console.error('Error actualizando heartbeat:', error);
    }
}

async function cleanupExpiredRooms() {
    if (!isHost || !currentGame) {
        return;
    }

    try {
        const now = Date.now();
        const timeoutMs = ROOM_TIMEOUT_MINUTES * 60 * 1000;
        
        // Verificar si la sala actual ha expirado
        const snapshot = await new Promise(resolve => {
            onValue(ref(database, `games/${currentGame}/lastActivity`), resolve, { onlyOnce: true });
        });

        if (snapshot.exists()) {
            const lastActivity = snapshot.val();
            const timeSinceLastActivity = now - lastActivity;
            
            if (timeSinceLastActivity > timeoutMs) {
                
                // Mostrar mensaje a todos los jugadores antes de eliminar
                await update(ref(database, `games/${currentGame}`), {
                    status: 'expired',
                    expiredMessage: 'La sala ha sido cerrada por inactividad (30 minutos sin actividad)'
                });
                
                // Esperar un poco para que los jugadores vean el mensaje
                setTimeout(async () => {
                    try {
                        await remove(ref(database, `games/${currentGame}`));
                    } catch (error) {
                        console.error('Error eliminando sala expirada:', error);
                    }
                }, 3000);
            }
        } else {
            await updateRoomHeartbeat();
        }
    } catch (error) {
        console.error('Error en cleanup de salas expiradas:', error);
    }
}

function startRoomTimeoutSystem() {
    // Limpiar timers previos
    stopRoomTimeoutSystem();
    
    if (!isHost) {
        return; // Solo el host maneja el sistema de timeout
    }
    
    // Actualizar heartbeat inmediatamente
    updateRoomHeartbeat();
    
    // Timer para heartbeat regular
    heartbeatTimer = setInterval(() => {
        updateRoomHeartbeat();
    }, HEARTBEAT_INTERVAL_SECONDS * 1000);
    
    // Timer para cleanup de salas expiradas
    cleanupTimer = setInterval(() => {
        cleanupExpiredRooms();
    }, CLEANUP_CHECK_INTERVAL_SECONDS * 1000);
}

function stopRoomTimeoutSystem() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }
}

function handleExpiredRoom() {
    // Mostrar mensaje de sala expirada
    showErrorMessage('joinLobbyError', 'La sala ha sido cerrada por inactividad');
    
    // Limpiar estado local
    currentGame = null;
    playerID = null;
    playerName = null;
    isHost = false;
    
    // Limpiar listeners
    resetGameListeners();
    
    // Volver al menú principal
    showScreen('mainScreen');
}

window.showMainMenu = () => showScreen('mainScreen');
window.showcreateLobbyScreen = () => showScreen('createLobbyScreen');
window.showjoinLobbyScreen = () => showScreen('joinLobbyScreen');

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}


function generateRandomCode(){
    return Math.floor(Math.random() * 900000) + 100000; // Genera un código aleatorio de 6 dígitos
}

function showErrorMessage(containerId, message, duration = 5000) {
    const errorContainer = document.getElementById(containerId);
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.hidden = false;
        
        // Auto-ocultar después del tiempo especificado
        setTimeout(() => {
            errorContainer.hidden = true;
        }, duration);
    }
}

window.createLobby = async () => {
    if(!createdLobby){
        createdLobby = true;
        const errorContainer = document.getElementById('createLobbyError');
        if (errorContainer) {
            errorContainer.hidden = true;
            createdLobby = false;
        }
        
        const hostName = document.getElementById('hostName').value.trim();
        if (!hostName) {
            showErrorMessage('createLobbyError', 'Por favor, ingresa un nombre de anfitrión.');
            createdLobby = false;
            return;
        }

        try {
            const gameCode = generateRandomCode();
            playerID = Date.now().toString(); // Genera un ID único basado en la hora actual
            playerName = hostName;
            isHost = true;

            const lobbyData = {
                code: gameCode,
                host: playerID,
                status: 'lobby',
                phase: 'lobby',
                players: {
                    [playerID]: {
                        name: playerName,
                        isHost: true,
                        isAlive: true,
                        role: null,
                        isAlguacil: false,
                        roleShown: false,
                        isInLove: false,
                    }
                },
                roles:{
                    alguacil: true,
                    aldeano: 0,
                    lobo: 0,
                    bruja: 0,
                    cazador: 0,
                    cupido: 0,
                    niña: 0,
                    vidente: 0,
                },
            };

            await set(ref(database, `games/${gameCode}`), lobbyData);
            currentGame = gameCode;

            document.getElementById('gameCodeDisplay').textContent = gameCode;
            startGameListener();
            showScreen('lobbyScreen');
            createdLobby = false;
        } catch (error) {
            console.error('Error al crear la sala:', error);
            showErrorMessage('createLobbyError', 'Error al crear la sala. Por favor, inténtalo de nuevo.');
        }
    }
    
}

window.joinLobby = async () => {
    if(!joinedLobby){
        joinedLobby = true;
        const errorContainer = document.getElementById('joinLobbyError');
        if (errorContainer) {
            errorContainer.hidden = true;
        }
        
        const playerNameInput = document.getElementById('playerName').value.trim();
        if (!playerNameInput) {
            showErrorMessage('joinLobbyError', 'Por favor, ingresa un nombre de jugador.');
            joinedLobby = false;
            return;
        }

        const gameCodeInput = document.getElementById('gameCode').value.trim();
        if (!gameCodeInput) {
            showErrorMessage('joinLobbyError', 'Por favor, ingresa un código de sala válido.');
            joinedLobby = false;
            return;
        }

        try{
            const refGame = ref(database, `games/${gameCodeInput}`);

            //Verificar si existe la partida
            const snapshot = await new Promise(resolve => {
                onValue(refGame, resolve, { onlyOnce: true });
            });

            if(!snapshot.exists()) {
                showErrorMessage('joinLobbyError', 'El código de sala no es válido o la sala no existe.');
                return;
            }

            const gameData = snapshot.val();
            if(gameData.status !== 'lobby') {
                showErrorMessage('joinLobbyError', 'La sala ya ha comenzado o está en un estado no válido.');
                return;
            }
            
            playerID = Date.now().toString(); // Genera un ID único basado en la hora actual
            playerName = playerNameInput;
            isHost = false;
            currentGame = gameCodeInput;

            // Añadir el jugador a la sala
            const playerData = {
                name: playerName,
                isHost: false,
                isAlive: true,
                role: null,
                isAlguacil: false,
                roleShown: false,
                isInLove: false,
            };

            await update(ref(database, `games/${currentGame}/players/${playerID}`), playerData);

            document.getElementById('gameCodeDisplay').textContent = gameCodeInput;
            startGameListener();
            showScreen('lobbyScreen');
            joinedLobby = false;
        } catch (error) {
            console.error('Error al unirse a la sala:', error);
            showErrorMessage('joinLobbyError', 'Error al unirse a la sala. Por favor, inténtalo de nuevo.');
        }
    }
}

function startGameListener(){
    // Limpiar listeners previos
    resetGameListeners();
    
    const refGame = ref(database, `games/${currentGame}`);
    gameListener = refGame;

    toggleDayNight(false);

    if (isHost) {
        startRoomTimeoutSystem();
    }

    onValue(refGame, (snapshot) => {
        if(!snapshot.exists()) {
            stopRoomTimeoutSystem();
            showMainMenu();
            return;
        }

        gameData = snapshot.val();

        if (gameData.status === 'expired') {
            stopRoomTimeoutSystem();
            handleExpiredRoom();
            return;
        }

        const wasHost = isHost;
        isHost = (gameData.host == playerID);

        if (wasHost !== isHost) {
            if (isHost) {
                startRoomTimeoutSystem();
            } else {
                stopRoomTimeoutSystem();
            }
        }

        if(gameData.status === 'role_assign') {
            preGameGameListener();
            return;
        }

        if(isHost) {
            if (gameData.roles) {
                gameconfiguration = { ...gameData.roles };
            } else {
                gameconfiguration = {
                    alguacil: true,
                    aldeano: 0,
                    lobo: 0,
                    bruja: 0,
                    cazador: 0,
                    cupido: 0,
                    niña: 0,
                    vidente: 0,
                };
            }
        } else if (wasHost && !isHost) {
            gameconfiguration = null;
        }

        updateLobbyUI(gameData);
    });
}

function updateLobbyUI(gameData){
    const playerList = gameData.players || {};
    const currentScreen = document.querySelector('.screen.active').id;
    
    if(!playerList[playerID]) {
        showScreen('mainScreen');
        return;
    }

    if(currentScreen === 'lobbyScreen'){
        const playerListContainer = document.getElementById('playersList');
        playerListContainer.innerHTML = ''; // Limpiar la lista de jugadores

        Object.entries(playerList).forEach(([id, player]) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player';
            
            // Nombre del jugador
            const playerName = document.createElement('span');
            playerName.textContent = `${player.name}${id === playerID ? ' (tú)' : ''} ${player.isHost ? '(Anfitrión)' : ''}`;
            playerDiv.appendChild(playerName);
            
            // Botones solo para el host y solo para otros jugadores
            if(isHost && id !== playerID) {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'player-actions';
                
                // Botón hacer anfitrión - solo emoji sin clase específica
                const makeHostBtn = document.createElement('button');
                makeHostBtn.textContent = '👑';
                makeHostBtn.title = 'Hacer Anfitrión';
                makeHostBtn.onclick = () => makeHost(id);
                actionsDiv.appendChild(makeHostBtn);
                
                // Botón expulsar - solo emoji sin clase específica
                const kickBtn = document.createElement('button');
                kickBtn.textContent = '❌';
                kickBtn.title = 'Expulsar';
                kickBtn.onclick = () => kickPlayer(id);
                actionsDiv.appendChild(kickBtn);
                
                playerDiv.appendChild(actionsDiv);
            }
            
            playerListContainer.appendChild(playerDiv);
        });

        const playerCountContainer = document.getElementById('playerCount');
        playerCountContainer.textContent = `Jugadores: ${Object.keys(playerList).length-1} (Total: ${Object.keys(playerList).length})`;

        const hostConfigurationContainer = document.getElementById('hostConfigurationLobby');
        if(isHost) {
            hostConfigurationContainer.hidden = false;
            updateLobbyUIHostConfigfuration(Object.keys(playerList).length);
        } else {
            hostConfigurationContainer.hidden = true;
        }
    }
}

function updateLobbyUIHostConfigfuration(playerCount) {
    let actualRoles = Object.values(gameconfiguration)
        .filter(value => typeof value === 'number')
        .reduce((sum, value) => sum + value, 0);

    const rolesCount = document.getElementById('rolesCount');
    rolesCount.textContent = `Roles repartidos: ${actualRoles}/${playerCount-1}`;

    // Validaciones de configuración
    const validationErrors = validateGameConfiguration(playerCount);
    
    // Mostrar advertencias si hay errores
    let warningElement = document.getElementById('roleWarning');
    
    if(validationErrors.length > 0) {
        warningElement.innerHTML = validationErrors.map(error => `⚠️ ${error}`).join('<br>');
        warningElement.hidden = false;
    } else {
        warningElement.hidden = true;
    }

    // Actualizar estado del botón de iniciar partida
    updateStartGameButton(validationErrors.length === 0);

    const aldeanoCountContainer = document.getElementById('aldeanoCount');
    aldeanoCountContainer.textContent = gameconfiguration.aldeano;

    const lobosCountContainer = document.getElementById('loboCount');
    lobosCountContainer.textContent = gameconfiguration.lobo;

    const brujaCountContainer = document.getElementById('brujaCheckbox');
    if(gameconfiguration.bruja > 0) {
        brujaCountContainer.checked = true;
    } else {
        brujaCountContainer.checked = false;
    }

    const cazadorCountContainer = document.getElementById('cazadorCheckbox');
    if(gameconfiguration.cazador > 0) {
        cazadorCountContainer.checked = true;
    } else {
        cazadorCountContainer.checked = false;
    }

    const cupidoCountContainer = document.getElementById('cupidoCheckbox');
    if(gameconfiguration.cupido > 0) {
        cupidoCountContainer.checked = true;
    } else {
        cupidoCountContainer.checked = false;
    }

    const niñaCountContainer = document.getElementById('niñaCheckbox');
    if(gameconfiguration.niña > 0) {
        niñaCountContainer.checked = true;
    } else {
        niñaCountContainer.checked = false;
    }

    const videnteCountContainer = document.getElementById('videnteCheckbox');
    if(gameconfiguration.vidente > 0) {
        videnteCountContainer.checked = true;
    } else {
        videnteCountContainer.checked = false;
    }

    // Guardar automáticamente la configuración cuando cambie (solo si es válida)
    if(validationErrors.length === 0) {
        saveGameConfiguration();
    }
}

function validateGameConfiguration(playerCount) {
    const errors = [];
    const playersInGame = playerCount - 1; // Excluir al host
    
    let actualRoles = Object.values(gameconfiguration)
        .filter(value => typeof value === 'number')
        .reduce((sum, value) => sum + value, 0);

    // Validación 1: Mínimo 3 jugadores (incluyendo host)
    if(playerCount < 4) {
        errors.push(`Se necesitan mínimo 3 jugadores (actualmente: ${playersInGame})`);
    }

    // Validación 2: Mínimo 1 lobo
    if(gameconfiguration.lobo < 1) {
        errors.push('Debe haber mínimo 1 lobo');
    }

    // Validación 3: Exactamente los mismos roles que jugadores
    if(actualRoles !== playersInGame && playersInGame >= 3) {
        if(actualRoles > playersInGame) {
            errors.push(`Tienes ${actualRoles - playersInGame} roles de más`);
        } else {
            errors.push(`Te faltan ${playersInGame - actualRoles} roles`);
        }
    }

    return errors;
}

function updateStartGameButton(isValid) {
    const startButton = document.getElementById('startGameButton');
    if(startButton) {
        startButton.disabled = !isValid;
        startButton.style.opacity = isValid ? '1' : '0.5';
        startButton.style.cursor = isValid ? 'pointer' : 'not-allowed';
        
        if(!isValid) {
            startButton.title = 'Corrige los errores de configuración para iniciar la partida';
        } else {
            startButton.title = 'Iniciar partida';
        }
    }
}

window.addRole = (role) => {
    if(!isHost){
        return;
    }

    // Remover la restricción de número máximo de jugadores
    // Permitir añadir roles libremente
    if(gameconfiguration[role] !== undefined) {
        gameconfiguration[role]++;
    } else {
        return;
    }

    const playerList = gameData.players || {};
    const playerCount = Object.keys(playerList).length;

    updateLobbyUIHostConfigfuration(playerCount);
}

window.removeRole = (role) => {
    if(!isHost){
        return;
    }

    if(gameconfiguration[role] > 0) {
        gameconfiguration[role]--;
    }

    const playerList = gameData.players || {};
    const playerCount = Object.keys(playerList).length;

    updateLobbyUIHostConfigfuration(playerCount);
}

window.toggleRole = (role) => {
    if(role === 'alguacil') {
        gameconfiguration[role] = !gameconfiguration[role];

        const playerList = gameData.players || {};
        const playerCount = Object.keys(playerList).length;

        updateLobbyUIHostConfigfuration(playerCount);
    } else {
        if(gameconfiguration[role] === 0) {
            addRole(role); // Alternar a 0
        } else {
            removeRole(role); // Alternar a 1
        }
    }
}

function saveGameConfiguration() {
    if(!isHost){
        return;
    }

    // Solo guardar si la configuración es válida
    const playerList = gameData.players || {};
    const playerCount = Object.keys(playerList).length;
    
    const validationErrors = validateGameConfiguration(playerCount);
    if(validationErrors.length > 0) {
        return; // No guardar si hay errores
    }

    update(ref(database, `games/${currentGame}`), { roles: gameconfiguration });
}


window.makeHost = async (newHostID)  => {
    if(!isHost){
        return;
    }

    try {
        //await update(ref(database, `games/${currentGame}`),{ roles: gameconfiguration });
        await update(ref(database, `games/${currentGame}`), { roles: gameconfiguration });

        await update(ref(database, `games/${currentGame}/players/${newHostID}`), { isHost: true });
        await update(ref(database, `games/${currentGame}/players/${playerID}`), { isHost: false });
        await update(ref(database, `games/${currentGame}`), { host: newHostID });

        gameconfiguration = null;
        isHost = false; // El jugador actual ya no es el anfitrión
    } catch (error) {
        console.error('Error al cambiar el anfitrión:', error);
    }
}

window.kickPlayer = async (playerIDToKick) => {
    if(!isHost){
        return;
    }

    try {
        await remove(ref(database, `games/${currentGame}/players/${playerIDToKick}`));
    } catch (error) {
        console.error('Error al expulsar al jugador:', error);
    }
}

window.leaveLobby = async () => {
    try{
        stopRoomTimeoutSystem();

        if(gameListener) {
            off(gameListener);
            gameListener = null;
        }

        if(currentGame && playerID){
            if(isHost) {
                // Si es el anfitrión, eliminamos el juego
                await remove(ref(database, `games/${currentGame}`));
            } else {
                // Si no es el anfitrión, solo eliminamos al jugador
                await remove(ref(database, `games/${currentGame}/players/${playerID}`));
            }
        }

        currentGame = null;
        playerID = null;
        playerName = null;
        isHost = false;

        showScreen('mainScreen');
    } catch (error) {
        console.error('Error al abandonar la sala:', error);
    }
}

//Limpiar las cosas antes de descargar la página
window.addEventListener('beforeunload', (event) => {
    // Solo mostrar diálogo de confirmación si está en una partida
    if(currentGame && playerID) {
        // Mensaje personalizado (nota: los navegadores modernos mostrarán un mensaje genérico por seguridad)
        const message = "¿Estás seguro de que deseas abandonar la partida? Si recargas la página podrías quedar desconectado del juego.";
        event.returnValue = message; // Estándar
        stopRoomTimeoutSystem();
        return message; // Para compatibilidad con navegadores antiguos
    }
});


window.startGame = async () => {
    if(!isHost){
        return;
    }

    const playerList = gameData.players || {};
    const playerCount = Object.keys(playerList).length;

    // Validar configuración antes de iniciar
    const validationErrors = validateGameConfiguration(playerCount);
    if(validationErrors.length > 0) {
        showErrorMessage('inLobbyError', `No se puede iniciar el juego:\n\n${validationErrors.map(error => `• ${error}`).join('\n')}`);
        return;
    }

    // Iniciar el juego
    try{
        await update(ref(database, `games/${currentGame}`), { roles: gameconfiguration });

        await update(ref(database, `games/${currentGame}`), {
            status: 'role_assign',
            phase: 'role_assign',
        });

        createRoleAssignUIImproved();
    } catch (error) {
        console.error('Error al iniciar el juego:', error);
    }
}

///////////////// ROLE ASSIGN /////////////////////////////

function preGameGameListener(){
    if(gameListener) {
        off(gameListener);
    }

    const refGame = ref(database, `games/${currentGame}`);
    gameListener = refGame;
    showScreen('roleAssignScreen');
    createRoleRevealPlayersUI();

    alguacilId = null;

    onValue(refGame, (snapshot) => {
        if(!snapshot.exists()) {
            showMainMenu();
            return;
        }

        gameData = snapshot.val();
        const currentStatus = gameData.status;
        const currentPhase = gameData.phase;

        if(currentStatus === 'role_assign') {
            if(currentPhase === 'role_assign') {
                updateRoleAssignUI();
            } else if(currentPhase === 'role_reveal'){
                updateRoleRevealUI();
            } else if(currentPhase === 'alguacil_assign') {
                updateAlguacilAssignUI();
            } else if(currentPhase === 'alguacil_reveal'){
                updateAlguacilRevealUI();
            }
        } else if(currentStatus === 'game') {
            inGameGameListener();
        }
    });
}

function updateRoleAssignUI() {
    if(isHost){
        
        document.getElementById('roleReveal').style.display = 'none';

        // Mostrar solo la configuración de roles del host
        const hostConfigurationContainer = document.getElementById('hostConfigurationRoles');
        hostConfigurationContainer.hidden = false;
        
        // Crear UI si no existe
        if (hostConfigurationContainer.innerHTML === '') {
            createRoleAssignUIImproved();
        }
    } else {
        document.getElementById('roleReveal').style.display = 'none';

        const HostName = gameData.players[gameData.host].name || 'el Anfitrión';
        const playersWaitContainer = document.getElementById('playersWait');
        playersWaitContainer.innerHTML = `<p>Espera que ${HostName} asigne los roles...</p>`;
        playersWaitContainer.hidden = false;
    }
}

function createRoleAssignUIImproved() {
    if(!isHost) {
        return;
    }

    const hostConfigurationContainer = document.getElementById('hostConfigurationRoles');
    hostConfigurationContainer.innerHTML = '';

    // Obtener jugadores disponibles sin el host
    const players = Object.entries(gameData.players)
        .filter(([id, player]) => id !== gameData.host)
        .map(([id, player]) => ({ id, name: player.name, assigned: false }));

    // Crear contenedores de cada tipo de rol
    Object.entries(gameData.roles).forEach(([role, count]) => {
        if(count > 0 && role !== 'alguacil') {
            const roleContainer = document.createElement('div');
            roleContainer.className = 'role-container';
            roleContainer.id = `${role}-container`;

            const roleTitle = document.createElement('h3');
            roleTitle.textContent = capitalizeFirstLetter(role);
            roleContainer.appendChild(roleTitle);

            for(let i = 0; i < count; i++){
                const selectContainer = document.createElement('div');
                selectContainer.className = 'role-select-container';
                selectContainer.id = `${role}-select-${i}`;

                const select = createPlayerSelect(role, i, players);
                selectContainer.appendChild(select);
                roleContainer.appendChild(selectContainer);
            }

            hostConfigurationContainer.appendChild(roleContainer);
        }
    })

    // Contenedor de botones centrados
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'role-assignment-buttons';

    const randomButton = document.createElement('button');
    randomButton.textContent = 'Asignar Roles Aleatoriamente';
    randomButton.onclick = assignRolesRandomly;
    buttonsContainer.appendChild(randomButton);

    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Confirmar Roles';
    confirmButton.onclick = confirmRoleAssignment;
    buttonsContainer.appendChild(confirmButton);

    hostConfigurationContainer.appendChild(buttonsContainer);
    
    // Mostrar el contenedor del host
    hostConfigurationContainer.hidden = false;
}

function createRoleRevealPlayersUI() {
    const roleRevealContainer = document.getElementById('roleReveal');
    roleRevealContainer.innerHTML = ''; // Limpiar el contenedor

    const button = document.createElement('button');
    button.textContent = 'Revelar Rol';
    button.onclick = () => {
        revealRole();
    };
    roleRevealContainer.appendChild(button);

    const roleDisplay = document.createElement('div');
    roleDisplay.id = 'roleDisplay';
    roleDisplay.className = 'role-display';

    const img = document.createElement('img');
    img.id = 'roleImage';
    img.src = 'images/back.png';
    img.alt = 'Rol del jugador';
    roleDisplay.appendChild(img);

    const p = document.createElement('p');
    p.id = 'roleText';
    p.textContent = 'Eres un...';
    roleDisplay.appendChild(p);

    const buttonreveal = document.createElement('button');
    buttonreveal.id = 'roleRevealButton';
    buttonreveal.textContent = 'Listo';
    buttonreveal.onclick = () => {
        revealRoleReady();
    };
    buttonreveal.disabled = true;
    buttonreveal.style.opacity = '0.5';
    buttonreveal.style.cursor = 'not-allowed';
    roleDisplay.appendChild(buttonreveal);

    roleRevealContainer.appendChild(roleDisplay);
}

function createPlayerSelect(role, index, availablePlayers){
    const select = document.createElement('select');
    select.id = `${role}-${index}`;
    select.className = 'player-select';

    //Default
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = `Selecciona jugador`;
    defaultOption.style.display = 'none';
    select.appendChild(defaultOption);

    //Agregar opciones de jugadores disponibles
    availablePlayers.forEach(player => {
        if(!player.assigned) {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = player.name;
            select.appendChild(option);
        }
    });

    select.addEventListener('change', function() {
        handlePlayerSelection(this, role, index);
    });

    return select;
}

function handlePlayerSelection(select, role, index){
    const selectedPlayerId = select.value;
    if(!selectedPlayerId) {
        return; // Si no se selecciona ningún jugador, no hacer nada
    }

    const container = select.parentElement;
    const playerName = select.options[select.selectedIndex].textContent;

    //Crear elemento para mostrar el jugador seleccionado
    const assignedPlayer = document.createElement('div');
    assignedPlayer.className = 'assigned-player';
    assignedPlayer.innerHTML = `
        <span>${playerName}</span>
        <button onclick="removePlayerAssignment('${role}', ${index}, '${selectedPlayerId}')">×</button>
    `;

    select.style.display = 'none'; // Ocultar el select
    container.appendChild(assignedPlayer);

    //Actualizar selects para que no aparezca el jugador seleccionado
    updateOtherSelects(selectedPlayerId);

    roleAssignment[selectedPlayerId] = role; // Guardar el rol asignado
}

window.removePlayerAssignment = (role, index, playerId) => {
    const container = document.getElementById(`${role}-select-${index}`);
    const select = container.querySelector('select');
    const assignedPlayer = container.querySelector('.assigned-player');

    if(assignedPlayer) {
        assignedPlayer.remove(); // Eliminar el jugador asignado
        select.value = ''; // Resetear el select
        select.style.display = 'block'; // Mostrar el select nuevamente
    }

    addPlayerToOtherSelects(playerId);
    delete roleAssignment[playerId]; // Limpiar la asignación del rol
}

function updateOtherSelects(playerId){
    document.querySelectorAll('.player-select').forEach(select => {
        const option = select.querySelector(`option[value="${playerId}"]`);
        if(option){
            option.remove(); // Eliminar el jugador de los selects
        }
    });
}

function addPlayerToOtherSelects(playerId) {
    const playerName = gameData.players[playerId].name;
    document.querySelectorAll('.player-select').forEach(select => {
        if(!select.querySelector(`option[value="${playerId}"]`)) {
            const option = document.createElement('option');
            option.value = playerId;
            option.textContent = playerName;
            select.appendChild(option);
        }
    });
}

function capitalizeFirstLetter(string){
    return string.charAt(0).toUpperCase() + string.slice(1);
}

async function confirmRoleAssignment() {
    if(!isHost){
        return;
    }

    const playerList = gameData.players || {};
    const playerCount = Object.keys(playerList).length;

    if(Object.keys(roleAssignment).length < playerCount - 1){
        showErrorMessage('preGameError', "Debes asignar todos los roles");
        return;
    }

    for (const [playerId, role] of Object.entries(roleAssignment)) {
        await update(ref(database, `games/${currentGame}/players/${playerId}`), { role });

        if(role === 'bruja'){
            await update(ref(database, `games/${currentGame}/players/${playerId}`), { healPotionsLeft: 1 });
        }
    }

    await update(ref(database, `games/${currentGame}`), {
            phase: 'role_reveal',
        });
}

async function assignRolesRandomly() {
    if(!isHost){
        return;
    }

    // 1. Obtener jugadores disponibles (sin host y sin rol asignado)
    const availablePlayers = Object.entries(gameData.players)
        .filter(([id, _]) => id !== playerID) // Excluir host
        .filter(([id, _]) => !roleAssignment.hasOwnProperty(id)) // Excluir ya asignados
        .map(([id, player]) => ({ id, name: player.name }));

    // 2. Obtener roles disponibles (slots no asignados)
    const availableRoleSlots = [];
    
    Object.entries(gameData.roles).forEach(([role, count]) => {
        if (typeof count === 'number' && count > 0) {
            for (let i = 0; i < count; i++) {
                const selectContainer = document.getElementById(`${role}-select-${i}`);
                
                if (selectContainer) {
                    // Verificar si ya hay un jugador asignado (div.assigned-player existe)
                    const assignedPlayerDiv = selectContainer.querySelector('.assigned-player');
                    
                    if (!assignedPlayerDiv) {
                        // Solo hay slot disponible si NO existe el div assigned-player
                        const selectElement = selectContainer.querySelector('select');
                        if (selectElement) {
                            availableRoleSlots.push({ role, index: i, selectElement });
                        }
                    }
                }
            }
        }
    });

    // 3. Verificar que tengamos suficientes jugadores para los roles disponibles
    if (availablePlayers.length < availableRoleSlots.length) {
        console.warn(` No hay suficientes jugadores disponibles. Jugadores: ${availablePlayers.length}, Roles: ${availableRoleSlots.length}`);
        return;
    }

    // 4. Mezclar arrays usando algoritmo Fisher-Yates para mejor aleatoriedad
    function shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            // Usar crypto.getRandomValues para mejor aleatoriedad si está disponible
            let j;
            if (window.crypto && window.crypto.getRandomValues) {
                const randomArray = new Uint32Array(1);
                window.crypto.getRandomValues(randomArray);
                j = Math.floor((randomArray[0] / (0xFFFFFFFF + 1)) * (i + 1));
            } else {
                j = Math.floor(Math.random() * (i + 1));
            }
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // 5. Mezclar tanto jugadores como roles para máxima aleatoriedad
    const shuffledPlayers = shuffleArray(availablePlayers);
    const shuffledRoleSlots = shuffleArray(availableRoleSlots);

    // 6. Asignar roles mezclados a jugadores mezclados
    const assignmentsToMake = Math.min(shuffledPlayers.length, shuffledRoleSlots.length);
    
    for (let i = 0; i < assignmentsToMake; i++) {
        const player = shuffledPlayers[i];
        const roleSlot = shuffledRoleSlots[i];
        
        // Encontrar la opción correspondiente al jugador en el select
        const option = Array.from(roleSlot.selectElement.options)
            .find(opt => opt.value === player.id);
        
        if (option) {
            // Asignar el valor y disparar el evento change
            roleSlot.selectElement.value = player.id;
            roleSlot.selectElement.dispatchEvent(new Event('change'));
        }
    }
}

function updateRoleRevealUI(){
    if(isHost){

        const hostConfigurationContainer = document.getElementById('hostConfigurationRoles');
        hostConfigurationContainer.hidden = true;

        const playerList = gameData.players || {};
        const hostWaitContainer = document.getElementById('hostWait');
        hostWaitContainer.hidden = false;
        
        let allRolesShown = true;
        Object.entries(playerList).forEach(([id, player]) => {
            if(!player.isHost){
                if(!player.roleShown){
                    hostWaitContainer.innerHTML = `<p>Esperando a que todos los jugadores revelen sus roles...</p>`;
                    allRolesShown = false;
                    return;
                }
            }
        });

        const forceButton = document.createElement('button');
        forceButton.className = 'force-advance-button';
        forceButton.textContent = 'Forzar Avance';
        forceButton.onclick = async () => {
            // Marcar todos los jugadores como que han visto su rol
            const playerUpdates = {};
            Object.entries(gameData.players).forEach(([id, player]) => {
                if(!player.isHost && !player.roleShown) {
                    playerUpdates[`players/${id}/roleShown`] = true;
                }
            });
            
            try {
                await update(ref(database, `games/${currentGame}`), playerUpdates);
                showHostGameStartButton();
            } catch (error) {
                console.error("Error forzando avance:", error);
            }
        };
        
        hostWaitContainer.appendChild(forceButton);
        
        if(allRolesShown){
            showHostGameStartButton();
        }
    } else {
        // Solo los jugadores que tienen rol pueden revelar
        if(gameData.players[playerID] && gameData.players[playerID].role) {

            // Si ya mostró el rol, mostrar espera
            if(gameData.players[playerID].roleShown) {
                document.getElementById('roleReveal').style.display = 'none';
                const playersWaitContainer = document.getElementById('playersWait');
                playersWaitContainer.innerHTML = `<p>Esperando a que todos los jugadores revelen sus roles...</p>`;
                playersWaitContainer.hidden = false;
            } else {
                // Mostrar pantalla de revelación
                document.getElementById('playersWait').hidden = true;
                const roleRevealContainer = document.getElementById('roleReveal');
                roleRevealContainer.style.display = 'flex';

                // Inicializar botón desactivado
                initializeRoleReveal();
            }
        } else {
            
            document.getElementById('roleReveal').style.display = 'none';
            const playersWaitContainer = document.getElementById('playersWait');
            playersWaitContainer.innerHTML = `<p>Esperando asignación de roles...</p>`;
            playersWaitContainer.hidden = false;
        }
    }
}

window.revealRole = async () => {
    const playerRole = gameData.players[playerID].role;
    const roleImage = document.getElementById('roleImage');
    
    // Agregar clase para animación
    roleImage.classList.add('flipped');
    
    // Cambiar la imagen a la mitad de la animación
    setTimeout(() => {
        roleImage.src = `images/${playerRole}.png`;
    }, 400); // A la mitad de la animación de 0.8s

    const roleText = document.getElementById('roleText');
    roleText.textContent = `Eres un... ${playerRole.charAt(0).toUpperCase() + playerRole.slice(1)}`;
    
    // Habilitar el botón "Listo" después de revelar el rol
    const readyButton = document.getElementById('roleRevealButton');
    if (readyButton) {
        readyButton.disabled = false;
        readyButton.style.opacity = '1';
        readyButton.style.cursor = 'pointer';
    }
}

window.revealRoleReady = async () => {
    // Ocultar la pantalla de revelación
    const roleRevealContainer = document.getElementById('roleReveal');
    roleRevealContainer.hidden = true;

    // Mostrar mensaje de espera
    const playersWaitContainer = document.getElementById('playersWait');
    playersWaitContainer.innerHTML = `<p>Esperando a que todos los jugadores revelen sus roles...</p>`;
    playersWaitContainer.hidden = false;

    // Actualizar en la base de datos
    try {
        await update(ref(database, `games/${currentGame}/players/${playerID}`), { roleShown: true });
    } catch (error) {
        console.error('Error al actualizar roleShown:', error);
    }
}

function showHostGameStartButton() {
    const hostWaitContainer = document.getElementById('hostWait');
    hostWaitContainer.innerHTML = '';

    const centeredContainer = document.createElement('div');
    centeredContainer.className = 'host-game-start';
    
    const startButton = document.createElement('button');
    startButton.textContent = 'Empezar Partida';
    startButton.onclick = () => {
        endRoleAssignment();
    };
    
    centeredContainer.appendChild(startButton);
    hostWaitContainer.appendChild(centeredContainer);
}

window.endRoleAssignment = async () => {
    //Si hay votación de alguacil, cambiar a esa fase
    if(gameData.roles.alguacil){

        const votacionesAlguacil = Object.entries(gameData.players)
                .filter(([id, player]) => id !== gameData.host)
                .reduce((acc, [id, player]) => {
                    acc[id] = {votaciones : 0};
                    return acc;
                }, {});

        await set(ref(database, `games/${currentGame}/votacionesAlguacil`), votacionesAlguacil);

        await update(ref(database, `games/${currentGame}`), {
            phase: 'alguacil_assign',
        });
    } else {
        const roleRevealContainer = document.getElementById('roleReveal');
        roleRevealContainer.hidden = true;

        startPreGame();
    }
}

function initializeRoleReveal() {
    const readyButton = document.querySelector('#roleDisplay button[onclick="revealRoleReady()"]');
    if (readyButton) {
        readyButton.disabled = true;
        readyButton.style.opacity = '0.5';
        readyButton.style.cursor = 'not-allowed';
    }
}

function updateAlguacilAssignUI(){
    if(isHost){
        const playerList = gameData.players || {};
        let numberPlayers = Object.keys(playerList).length - 1; // Excluir al host

        let votacionesTotales = 0;
        Object.entries(gameData.votacionesAlguacil || {}).forEach(([id, votaciones]) => {
            if(id !== gameData.host) {
                votacionesTotales += votaciones.votaciones || 0;
            }
        });

        const hostWaitContainer = document.getElementById('hostWait');
        hostWaitContainer.innerHTML = '';
        
        // Crear contenedor principal
        const mainContainer = document.createElement('div');
        mainContainer.className = 'alguacil-voting-container';
        
        // 1. Sección de instrucciones
        const instructionsSection = document.createElement('div');
        instructionsSection.className = 'alguacil-instructions';
        instructionsSection.innerHTML = `
            <h3>Votación para Alguacil</h3>
            <p>Los jugadores están votando por quién será el alguacil del pueblo</p>
        `;
        mainContainer.appendChild(instructionsSection);

        // 2. Sección de votos (más llamativa)
        const votesSection = document.createElement('div');
        votesSection.className = 'alguacil-votes-section';
        
        const votesTitle = document.createElement('h3');
        votesTitle.textContent = 'Votos Actuales';
        votesSection.appendChild(votesTitle);

        const votesGrid = document.createElement('div');
        votesGrid.className = 'votes-grid';

        // Obtener jugadores disponibles
        const availablePlayers = Object.entries(gameData.players)
            .filter(([id, player]) => id !== gameData.host)
            .map(([id, player]) => ({ id, name: player.name }));

        // Mostrar votos en cards
        const votos = Object.entries(gameData.votacionesAlguacil).map(([id, data]) => ({
            id,
            name: availablePlayers.find(player => player.id === id)?.name,
            votaciones: data.votaciones
        }));

        votos.forEach(voto => {
            const voteCard = document.createElement('div');
            voteCard.className = 'vote-card';
            
            // Nombre del jugador
            const playerName = document.createElement('span');
            playerName.className = 'player-name';
            playerName.textContent = voto.name;
            voteCard.appendChild(playerName);
            
            // Contenedor para votos y botón
            const voteControls = document.createElement('div');
            voteControls.className = 'vote-controls';
            
            // Contador de votos
            const voteCount = document.createElement('span');
            voteCount.className = 'vote-count';
            voteCount.textContent = voto.votaciones;
            voteControls.appendChild(voteCount);
            
            // Botón para añadir voto (+)
            const addButton = document.createElement('button');
            addButton.className = 'add-vote-button';
            addButton.textContent = '+';
            addButton.title = 'Añadir voto';
            addButton.onclick = async () => {
                try {
                    // Incrementar voto
                    const currentVotes = gameData.votacionesAlguacil[voto.id].votaciones || 0;
                    await update(ref(database, `games/${currentGame}/votacionesAlguacil/${voto.id}`), {
                        votaciones: currentVotes + 1
                    });
                    
                    // Mostrar confirmación visual breve
                    addButton.classList.add('vote-added');
                    setTimeout(() => addButton.classList.remove('vote-added'), 300);
                } catch (error) {
                    console.error("Error al añadir voto:", error);
                }
            };
            voteControls.appendChild(addButton);
            
            voteCard.appendChild(voteControls);
            votesGrid.appendChild(voteCard);
        });

        votesSection.appendChild(votesGrid);
        mainContainer.appendChild(votesSection);

        // 3. Sección de estado/selección
        if(votacionesTotales < numberPlayers){
            // Mensaje de espera
            const waitingSection = document.createElement('div');
            waitingSection.className = 'alguacil-waiting';
            waitingSection.innerHTML = `
                <p>Esperando a que todos los jugadores voten... (${votacionesTotales}/${numberPlayers})</p>
            `;
            mainContainer.appendChild(waitingSection);
        } else {
            // Sección de selección del alguacil
            const selectionSection = document.createElement('div');
            selectionSection.className = 'alguacil-selection-section';
            
            const selectionTitle = document.createElement('h3');
            selectionTitle.textContent = 'Seleccionar Alguacil';
            selectionSection.appendChild(selectionTitle);
            
            // Encontrar jugadores con más votos
            const maxVotos = Math.max(...Object.values(gameData.votacionesAlguacil)
                .map(v => v.votaciones));
            
            const jugadoresMaxVotos = Object.entries(gameData.votacionesAlguacil)
                .filter(([id, data]) => data.votaciones === maxVotos);

            const select = document.createElement('select');
            select.className = 'alguacil-select';

            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Selecciona el alguacil';
            defaultOption.style.display = 'none';
            select.appendChild(defaultOption);

            jugadoresMaxVotos.forEach(([id, data]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = gameData.players[id].name;
                select.appendChild(option);
            });

            selectionSection.appendChild(select);

            const confirmButton = document.createElement('button');
            confirmButton.textContent = 'Confirmar Alguacil';
            confirmButton.onclick = async () => {
                const selectedPlayerId = select.value;
                if(selectedPlayerId) {
                    try{
                        await update(ref(database, `games/${currentGame}/players/${selectedPlayerId}`), {
                            isAlguacil: true
                        });

                        await remove(ref(database, `games/${currentGame}/votacionesAlguacil`));

                        await update(ref(database, `games/${currentGame}`), {
                            phase: 'alguacil_reveal'
                        });
                    } catch (error) {
                        console.error("Error al asignar el alguacil", error);
                    }
                }
            };

            selectionSection.appendChild(confirmButton);
            mainContainer.appendChild(selectionSection);
        }

        hostWaitContainer.appendChild(mainContainer);
        hostWaitContainer.hidden = false;
        
    } else {
        // Para jugadores - mantener la lógica existente pero con mejor CSS
        const roleRevealContainer = document.getElementById('roleReveal');
        roleRevealContainer.hidden = true;

        const playersWaitContainer = document.getElementById('playersWait');
        playersWaitContainer.hidden = true;

        const alguacilAssignContainer = document.getElementById('alguacilAssign');
        if(alguacilAssignContainer.innerHTML === ''){

            const container = document.createElement('div');
            container.className = 'alguacil-voting-container';
            
            const title = document.createElement('h2');
            title.textContent = 'Votación para Alguacil';
            title.style.textAlign = 'center';
            title.style.marginBottom = '20px';
            container.appendChild(title);

            const select = document.createElement('select');
            select.className = 'alguacil-vote-select';

            const availablePlayers = Object.entries(gameData.players)
                .filter(([id, player]) => id !== gameData.host)
                .map(([id, player]) => ({ id, name: player.name }));

            // Default option
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Vota por un jugador para alguacil';
            defaultOption.style.display = 'none';
            select.appendChild(defaultOption);

            // Agregar opciones de jugadores disponibles
            availablePlayers.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = player.name + (player.id === playerID ? ' (Tú)' : '');
                select.appendChild(option);
            });

            select.addEventListener('change', function() {
                handleAlguacilPlayerSelection(this);
            });

            container.appendChild(select);
            alguacilAssignContainer.appendChild(container);
            alguacilAssignContainer.hidden = false;
        }
    }
}

window.handleAlguacilPlayerSelection = async (select) => {
    const selectedPlayerId = select.value;
    if(!selectedPlayerId) {
        return;
    }

    // Ocultar el select
    const selectObject = document.getElementsByClassName('alguacil-vote-select')[0];
    selectObject.style.display = 'none';

    // Guardar referencias ANTES del await
    const container = select.parentElement;
    const playerName = select.options[select.selectedIndex].textContent;
    
    if (!container) {
        console.warn('Container no encontrado, el select fue eliminado del DOM');
        return;
    }

    let votacionesActuales = gameData.votacionesAlguacil[selectedPlayerId].votaciones || 0;
    const nuevasVotaciones = votacionesActuales + 1;

    await update(ref(database, `games/${currentGame}/votacionesAlguacil/${selectedPlayerId}`), {
        votaciones: nuevasVotaciones
    });

    // Verificar que el container aún existe
    if (!container.parentNode) {
        console.warn('Container fue removido del DOM durante la operación async');
        return;
    }

    const assignedPlayer = document.createElement('div');
    assignedPlayer.className = 'assigned-player';
    assignedPlayer.innerHTML = `
        <span>Has votado por ${playerName} para alguacil</span>
    `;

    container.appendChild(assignedPlayer);
}

let alguacilId = null;

function updateAlguacilRevealUI(){
    // Ocultar otras pantallas
    const alguacilAssignContainer = document.getElementById('alguacilAssign');
    alguacilAssignContainer.hidden = true;

    const hostWaitContainer = document.getElementById('hostWait');
    hostWaitContainer.hidden = true;

    const alguacilShowContainer = document.getElementById('alguacilShow');
    
    // Encontrar el alguacil
    const alguacil = Object.entries(gameData.players)
        .find(([_, player]) => player.isAlguacil)?.[1]?.name || 'No encontrado';

    alguacilId = Object.entries(gameData.players)
        .find(([_, player]) => player.isAlguacil)?.[0] || null;

    // Crear el contenedor decorado
    const revealContainer = document.createElement('div');
    revealContainer.className = 'alguacil-reveal-container';
    
    // Partículas decorativas
    const particles = document.createElement('div');
    particles.className = 'alguacil-particles';
    for(let i = 0; i < 5; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particles.appendChild(particle);
    }
    revealContainer.appendChild(particles);
    
    // Contenido principal
    const content = document.createElement('div');
    content.className = 'alguacil-reveal-content';
    
    content.innerHTML = `
        <h1 class="alguacil-title">El Alguacil Ha Sido Elegido</h1>
        <div class="alguacil-name">${alguacilId === playerID ? `${alguacil} (tú)` : alguacil}</div>
        <br><br>
        <div class="alguacil-powers">
            <h4>⚖️ Poderes del Alguacil</h4>
            <p>Su voto cuenta doble durante las votaciones del día. Una gran responsabilidad recae sobre sus hombros.</p>
        </div>
    `;
    
    revealContainer.appendChild(content);
    alguacilShowContainer.innerHTML = '';
    alguacilShowContainer.appendChild(revealContainer);
    alguacilShowContainer.hidden = false;

    // Continuar automáticamente después de 6 segundos
    if(isHost){
        setTimeout(async () => {
            try {
                await startPreGame();
                alguacilShowContainer.hidden = true;
            } catch (error) {
                showErrorMessage('preGameError', 'Error al iniciar la siguiente fase:', error);
            }
        }, 6000); // Aumentado a 6 segundos para apreciar la animación
    }
}

/////////////////////////   IN GAME   ////////////////////////////////////////

let playerKilled = null; // Variable para almacenar el jugador asesinado por el lobo
let isSaved = false; // Variable para verificar si la bruja ha salvado al jugador asesinado
let previousPhase = ''; // Variable para almacenar la fase anterior
let playerWasCazador = false; // Variable para verificar si el jugador era cazador
let CoupleAnounced = false; // Variable para verificar si la pareja ha sido anunciada

async function startPreGame(){
    if(isHost){
        playerKilled = null;
        previousPhase = '';
        playerWasCazador = false;
        CoupleAnounced = false;
    }
    try{
        await update(ref(database, `games/${currentGame}`), {
            status: 'game',
        });

        if(gameData.roles.cupido > 0){
            await update(ref(database, `games/${currentGame}`), {
                status: 'game',
                phase: 'cupido_assign',
            });
        }

        else {
            gameCycle();
        }
    } catch (error) {
        console.error('Error al iniciar el juego:', error);
    }
}

function inGameGameListener(){
    if(gameListener) {
        off(gameListener);
    }

    const refGame = ref(database, `games/${currentGame}`);
    gameListener = refGame;

    if(isHost){
        showScreen('hostGameScreen');
    } else {
        showScreen('playerGameScreen');
    }

    onValue(refGame, (snapshot) => {
        if(!snapshot.exists()) {
            showMainMenu();
            return;
        }

        gameData = snapshot.val();
        const currentPhase = gameData.phase;
        const currentStatus = gameData.status;

        updateThemeBasedOnPhase(currentPhase);

        if(isHost){

            if(previousPhase === currentPhase && currentPhase !== 'votacion_dia'){
                return; // Si la fase no ha cambiado, no hacer nada
            }

            previousPhase = currentPhase;

            if(currentPhase !== 'anuncio_muerte_noche' && currentPhase !== 'anuncio_muerte_dia'){
                hideAllHostGameScreens();
            }

            if(currentPhase === 'cupido_assign') {
                updateCupidoAssignUI();
            } else if (currentPhase === 'vidente_turn') {
                updateVidenteTurnUI();
            } else if (currentPhase === 'lobo_turn') {
                updateLoboTurnUI();
            } else if(currentPhase === 'bruja_turn') {
                updateBrujaTurnUI();
            } else if(currentPhase === 'amanecer_dia') {
                updateAmanecerDiaUI();
            } else if(currentPhase === 'muerte_noche' || currentPhase === 'muerte_dia' || currentPhase === 'anuncio_muerte_noche' || currentPhase === 'anuncio_muerte_dia') {
                updateKillUI();
            } else if(currentPhase === 'votacion_dia') {
                updateVoteDayUI();
            } else if(currentPhase === 'victoria_lobos' || currentPhase === 'victoria_aldeanos') {
                handleGameEnd(currentPhase);
            }
        } else {

            if(currentStatus !== 'game'){
                cleanupAllGameScreens();
                startGameListener();
                showScreen('lobbyScreen');
                return; 
            }

            if(previousPhase === currentPhase){
                return; // Si la fase no ha cambiado, no hacer nada
            }

            previousPhase = currentPhase;

            if(gameData.players[playerID].isAlive){
                if(currentPhase !== 'anuncio_muerte_noche' && currentPhase !== 'anuncio_muerte_dia'){
                    hideAllPlayerGameScreens();
                }

                if(currentPhase === 'cupido_assign' || currentPhase === 'vidente_turn' || currentPhase === 'lobo_turn' || currentPhase === 'bruja_turn' || currentPhase === 'role_reveal' || currentPhase === 'alguacil_reveal'){
                    showNightScreen();
                } else if (currentPhase === 'amanecer_dia'){
                    showDayScreen();
                } else if (currentPhase === 'muerte_noche' || currentPhase === 'muerte_dia' || currentPhase === 'anuncio_muerte' || currentPhase === 'anuncio_muerte_noche' || currentPhase === 'anuncio_muerte_dia') {
                    showDeathScreen();
                } else if (currentPhase === 'votacion_dia'){
                    showVoteScreen();
                } else if (currentPhase === 'victoria_lobos' || currentPhase === 'victoria_aldeanos') {
                    handleGameEnd(currentPhase);
                }
            } else {
                if(currentPhase === 'victoria_lobos' || currentPhase === 'victoria_aldeanos'){
                    hideAllPlayerGameScreens();
                    handleGameEnd(currentPhase);
                } else {
                    setTimeout(() => {
                        hideAllPlayerGameScreens();
                        showDeathPlayerScreen();
                    }, 4000);
                }
            }
        }
    });
}

//Llamaremos a esta función cuando necesitemos cambiar de fase
async function gameCycle(){
    if(!isHost){
        return;
    }

    const currentPhase = gameData.phase;
    let nextPhase = '';

    switch(currentPhase) {
        case 'cupido_assign':
        case 'role_reveal':
        case 'alguacil_reveal':
            nextPhase = isVidenteAlive() ? 'vidente_turn' : 
                        isLoboAlive() ? 'lobo_turn' : 
                        isBrujaAlive() ? 'bruja_turn' : 'amanecer_dia';
            break;
        
        case 'vidente_turn':
            nextPhase = isLoboAlive() ? 'lobo_turn' : 
                        isBrujaAlive() ? 'bruja_turn' : 'amanecer_dia';
            break;
        
        case 'lobo_turn':
            nextPhase = isBrujaAlive() ? 'bruja_turn' : 'amanecer_dia';
            break;
        
        case 'bruja_turn':
            nextPhase = 'amanecer_dia';
            break;
        
        case 'amanecer_dia':
            nextPhase = 'muerte_noche';
            break;

        case 'muerte_noche':
            nextPhase = 'anuncio_muerte_noche';
            break;

        case 'anuncio_muerte_noche':
            //nextPhase = isMoreLobosThanAldeanos() ? 'victoria_lobos' : 'votacion_dia';
            if(!isLoboAlive()){
                nextPhase = 'victoria_aldeanos';
            } else if(isMoreLobosThanAldeanos()){
                nextPhase = 'victoria_lobos';
            } else {
                nextPhase = 'votacion_dia';
            }
            break;

        case 'votacion_dia':
            nextPhase = 'muerte_dia';
            break;
        
        case 'muerte_dia':
            nextPhase = 'anuncio_muerte_dia';
            break;

        case 'anuncio_muerte_dia':
            if(!isLoboAlive()){
                nextPhase = 'victoria_aldeanos';
            } else if(isMoreLobosThanAldeanos()){
                nextPhase = 'victoria_lobos';
            } else {
                nextPhase = isVidenteAlive() ? 'vidente_turn' :
                            isLoboAlive() ? 'lobo_turn' :
                            isBrujaAlive() ? 'bruja_turn' : 'muerte_noche';
            }
            break;

        default:
            console.error('Fase desconocida:', currentPhase);
            return;
    }

    await update(ref(database, `games/${currentGame}`), {
        phase: nextPhase
    });

    if (nextPhase === 'fin_lobos_ganan' || nextPhase === 'fin_aldeanos_ganan') {
        handleGameEnd(nextPhase);
    }
}

function createTimeIndicator(isNight = true) {
    const indicator = document.createElement('div');
    indicator.className = `time-indicator ${isNight ? 'night' : 'day'}`;
    indicator.textContent = isNight ? '🌙 NOCHE' : '☀️ DÍA';
    return indicator;
}

function createHostInstructions(title, description) {
    const instructions = document.createElement('div');
    instructions.className = 'host-instructions';
    instructions.innerHTML = `
        <h3>${title}</h3>
        <p>${description}</p>
    `;
    return instructions;
}

function updateCupidoAssignUI(){
    const cupidoAssignContainer = document.getElementById('cupidoAssignScreen');
    cupidoAssignContainer.hidden = false;
    cupidoAssignContainer.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'host-phase-container';

    // Indicador de tiempo
    container.appendChild(createTimeIndicator(true));

    // Instrucciones iniciales
    const initialInstructions = createHostInstructions(
        'Fase de Cupido',
        'Los jugadores deben irse a dormir. Cupido debe seleccionar 2 jugadores para enamorarse...'
    );
    container.appendChild(initialInstructions);

    setTimeout(() => {
        container.innerHTML = '';
        container.appendChild(createTimeIndicator(true));
        
        const instructions = createHostInstructions(
            'Cupido - Selección de Enamorados',
            'Cupido debe elegir a dos jugadores que se enamorarán. Su destino estará unido durante toda la partida.'
        );
        container.appendChild(instructions);

        // Contenedor de selección
        const selectionDiv = document.createElement('div');
        selectionDiv.className = 'cupido-selection';

        const coupleSelectorDiv = document.createElement('div');
        coupleSelectorDiv.className = 'couple-selectors';

        const availablePlayers = Object.entries(gameData.players)
            .filter(([id, player]) => id !== gameData.host && player.isAlive)
            .map(([id, player]) => ({ id, name: player.name }));

        // Crear los dos selects
        const select1 = createPlayerSelectForCupido(availablePlayers, 0);
        const select2 = createPlayerSelectForCupido(availablePlayers, 1);

        // Corazón entre selects
        const heartSeparator = document.createElement('div');
        heartSeparator.className = 'heart-separator';
        heartSeparator.textContent = '💕';

        coupleSelectorDiv.appendChild(select1);
        coupleSelectorDiv.appendChild(heartSeparator);
        coupleSelectorDiv.appendChild(select2);

        selectionDiv.appendChild(coupleSelectorDiv);

        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Confirmar Enamoramiento';
        confirmButton.onclick = () => confirmCupidoAssignment();
        selectionDiv.appendChild(confirmButton);

        container.appendChild(selectionDiv);
    }, 3000);

    cupidoAssignContainer.appendChild(container);
}

function createPlayerSelectForCupido(players, index) {
    const select = document.createElement('select');
    select.className = 'cupido-player-select';
    select.dataset.selectIndex = index;

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = `Selecciona jugador ${index + 1}`;
    defaultOption.style.display = 'none';
    select.appendChild(defaultOption);

    players.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = player.name;
        select.appendChild(option);
    });

    select.addEventListener('change', function() {
        updateCupidoSelects(this);
    });

    return select;
}

function updateCupidoSelects(changedSelect) {
    const allSelects = document.querySelectorAll('.cupido-player-select');
    const selectedValues = Array.from(allSelects).map(s => s.value).filter(v => v);

    allSelects.forEach(select => {
        if (select !== changedSelect) {
            Array.from(select.options).forEach(option => {
                if (option.value && selectedValues.includes(option.value)) {
                    option.style.display = 'none';
                } else {
                    option.style.display = 'block';
                }
            });
        }
    });
}

async function confirmCupidoAssignment() {
    const selectedPlayers = Array.from(document.querySelectorAll('.cupido-player-select'))
        .map(select => select.value)
        .filter(value => value);

    if (selectedPlayers.length !== 2) {
        showErrorMessage('inGameError', 'Debes seleccionar exactamente 2 jugadores.');
        return;
    }

    try {
        await update(ref(database, `games/${currentGame}/players/${selectedPlayers[0]}`), {
            isInLove: true,
            lovedPlayer: selectedPlayers[1]
        });
        await update(ref(database, `games/${currentGame}/players/${selectedPlayers[1]}`), {
            isInLove: true,
            lovedPlayer: selectedPlayers[0]
        });

        showCupidoCoupleReveal(selectedPlayers[0], selectedPlayers[1]);
    } catch (error) {
        console.error('Error al confirmar enamoramiento:', error);
    }
}

function showCupidoCoupleReveal(player1Id, player2Id) {
    const cupidoAssignContainer = document.getElementById('cupidoAssignScreen');
    cupidoAssignContainer.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'host-phase-container';

    container.appendChild(createTimeIndicator(true));

    const instructions = createHostInstructions(
        'Cupido - Enamorados Revelados',
        'Los siguientes jugadores han sido enamorados por Cupido. Despiértalos para que se reconozcan.'
    );
    container.appendChild(instructions);

    const coupleDisplay = document.createElement('div');
    coupleDisplay.className = 'couple-display';

    const player1 = gameData.players[player1Id];
    const player2 = gameData.players[player2Id];

    const member1 = document.createElement('div');
    member1.className = 'couple-member';
    member1.innerHTML = `
        <div class="name">${player1.name}</div>
        <div class="role">(${player1.role})</div>
    `;

    const heartSeparator = document.createElement('div');
    heartSeparator.className = 'heart-separator';
    heartSeparator.textContent = '💕';

    const member2 = document.createElement('div');
    member2.className = 'couple-member';
    member2.innerHTML = `
        <div class="name">${player2.name}</div>
        <div class="role">(${player2.role})</div>
    `;

    coupleDisplay.appendChild(member1);
    coupleDisplay.appendChild(heartSeparator);
    coupleDisplay.appendChild(member2);

    container.appendChild(coupleDisplay);

    const continueButton = document.createElement('button');
    continueButton.textContent = 'Continuar';
    continueButton.onclick = () => {
        cupidoAssignContainer.hidden = true;
        gameCycle();
    };
    container.appendChild(continueButton);

    cupidoAssignContainer.appendChild(container);
}

function hideAllHostGameScreens() {
    const hostGameScreens = document.querySelectorAll('#hostGameScreen > div');

    hostGameScreens.forEach(screen => {
        screen.hidden = true;
        screen.innerHTML = '';
        screen.replaceChildren(); 
    });
}

function updateVidenteTurnUI(){
    const videnteAssignContainer = document.getElementById('videnteAssignScreen');
    videnteAssignContainer.hidden = false;
    videnteAssignContainer.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'host-phase-container';

    container.appendChild(createTimeIndicator(true));

    const initialInstructions = createHostInstructions(
        'Fase de Vidente',
        'Los jugadores deben irse a dormir. La Vidente debe seleccionar un jugador para ver su rol...'
    );
    container.appendChild(initialInstructions);

    setTimeout(() => {
        container.innerHTML = '';
        container.appendChild(createTimeIndicator(true));
        
        const instructions = createHostInstructions(
            'Vidente - Visión Nocturna',
            'La Vidente puede ver el rol de un jugador. Selecciona a quién quiere investigar esta noche.'
        );
        container.appendChild(instructions);

        const selectionDiv = document.createElement('div');
        selectionDiv.className = 'vidente-selection';

        const availablePlayers = Object.entries(gameData.players)
            .filter(([id, player]) => id !== gameData.host && player.isAlive)
            .map(([id, player]) => ({ id, name: player.name }));

        const select = document.createElement('select');
        select.className = 'vidente-player-select';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Selecciona jugador a investigar';
        defaultOption.style.display = 'none';
        select.appendChild(defaultOption);

        availablePlayers.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = player.name;
            select.appendChild(option);
        });

        selectionDiv.appendChild(select);

        const cardContainer = document.createElement('div');
        cardContainer.className = 'vidente-card-container';

        const roleCard = document.createElement('img');
        roleCard.className = 'vidente-role-card';
        roleCard.src = 'images/back.png';
        roleCard.alt = 'Carta de Rol';

        cardContainer.appendChild(roleCard);
        selectionDiv.appendChild(cardContainer);

        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Confirmar Selección';
        confirmButton.onclick = () => confirmVidenteSelection(select, roleCard, confirmButton);
        selectionDiv.appendChild(confirmButton);

        container.appendChild(selectionDiv);
    }, 3000);

    videnteAssignContainer.appendChild(container);
}

async function confirmVidenteSelection(select, roleCard, button) {
    const selectedPlayerId = select.value;
    if (!selectedPlayerId) {
        showErrorMessage('inGameError', 'Selecciona un jugador primero');
        return;
    }

    // Desactivar botón para prevenir spam
    button.disabled = true;
    button.classList.add('button-processing');
    button.textContent = 'Revelando rol';

    const selectedPlayer = gameData.players[selectedPlayerId];
    
    // Agregar animación de flip
    roleCard.classList.add('flipped');
    
    setTimeout(() => {
        roleCard.src = `images/${selectedPlayer.role}.png`;
        
        // Crear botón continuar después de revelar
        setTimeout(() => {
            const continueButton = document.createElement('button');
            continueButton.textContent = 'Continuar';
            continueButton.onclick = () => {
                document.getElementById('videnteAssignScreen').hidden = true;
                gameCycle();
            };
            
            button.parentNode.appendChild(continueButton);
            button.style.display = 'none';
        }, 1000);
    }, 400);
}

function updateLoboTurnUI(){
    const loboAssignContainer = document.getElementById('loboAssignScreen');
    loboAssignContainer.hidden = false;
    loboAssignContainer.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'host-phase-container';

    container.appendChild(createTimeIndicator(true));

    const initialInstructions = createHostInstructions(
        'Fase de Lobos',
        'Los jugadores deben irse a dormir. Los Lobos deben seleccionar un jugador para eliminar...'
    );
    container.appendChild(initialInstructions);

    setTimeout(() => {
        container.innerHTML = '';
        container.appendChild(createTimeIndicator(true));
        
        const instructions = createHostInstructions(
            'Lobos - Caza Nocturna',
            'Los lobos salen a cazar. Deben elegir a una víctima para eliminar durante la noche.'
        );
        container.appendChild(instructions);

        const selectionDiv = document.createElement('div');
        selectionDiv.className = 'lobo-kill-selection';

        const availablePlayers = Object.entries(gameData.players)
            .filter(([id, player]) => id !== gameData.host && player.isAlive)
            .map(([id, player]) => ({ id, name: player.name, role: player.role }));

        const select = document.createElement('select');
        select.className = 'lobo-player-select';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Selecciona víctima';
        defaultOption.style.display = 'none';
        select.appendChild(defaultOption);

        availablePlayers.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = `${player.name} (${player.role})`;
            select.appendChild(option);
        });

        selectionDiv.appendChild(select);

        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Confirmar Eliminación';
        confirmButton.onclick = () => confirmLoboKill(select, selectionDiv, confirmButton);
        selectionDiv.appendChild(confirmButton);

        container.appendChild(selectionDiv);
    }, 3000);

    loboAssignContainer.appendChild(container);
}

async function confirmLoboKill(select, container, button) {
    const selectedPlayerId = select.value;
    if (!selectedPlayerId) {
        showErrorMessage('inGameError', 'Selecciona una víctima primero');
        return;
    }

    // Desactivar botón para prevenir spam
    button.disabled = true;
    button.classList.add('button-processing');
    button.textContent = 'Confirmando eliminación';

    const selectedPlayer = gameData.players[selectedPlayerId];
    
    // Mostrar información de la víctima
    const killDisplay = document.createElement('div');
    killDisplay.className = 'kill-target-display';
    killDisplay.innerHTML = `
        <h4>🐺 Víctima Seleccionada</h4>
        <div class="target-info">
            <span class="skull-icon">💀</span>
            <span class="target-name">${selectedPlayer.name}</span>
            <span class="target-role">(${selectedPlayer.role})</span>
        </div>
    `;

    // Ocultar select y mostrar confirmación
    select.style.display = 'none';
    container.insertBefore(killDisplay, button);

    try {
        playerKilled = {
            id: selectedPlayerId,
            name: selectedPlayer.name,
            role: selectedPlayer.role,
            isInLove: selectedPlayer.isInLove,
        };

        await update(ref(database, `games/${currentGame}/playerKilled`), playerKilled);

        // Cambiar botón a continuar
        setTimeout(() => {
            button.textContent = 'Continuar';
            button.classList.remove('button-processing');
            button.disabled = false;
            button.onclick = () => {
                document.getElementById('loboAssignScreen').hidden = true;
                gameCycle();
            };
        }, 1500);
    } catch (error) {
        console.error("Error updating player killed:", error);
        button.disabled = false;
        button.classList.remove('button-processing');
        button.textContent = 'Confirmar Eliminación';
    }
}

function updateBrujaTurnUI(){
    const brujaAssignContainer = document.getElementById('brujaAssignScreen');
    brujaAssignContainer.hidden = false;
    brujaAssignContainer.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'host-phase-container';

    container.appendChild(createTimeIndicator(true));

    const initialInstructions = createHostInstructions(
        'Fase de Bruja',
        'Los jugadores deben irse a dormir. La Bruja debe decidir si salvar a la víctima...'
    );
    container.appendChild(initialInstructions);

    setTimeout(() => {
        container.innerHTML = '';
        container.appendChild(createTimeIndicator(true));
        
        const instructions = createHostInstructions(
            'Bruja - Decisión Nocturna',
            'La Bruja conoce quién fue atacado por los lobos. Puede usar su poción de sanación para salvarlo.'
        );
        container.appendChild(instructions);

        const decisionDiv = document.createElement('div');
        decisionDiv.className = 'bruja-decision';

        // Mostrar información de la víctima
        const victimInfo = document.createElement('div');
        victimInfo.className = 'victim-info';
        
        const victimName = playerKilled ? playerKilled.name : 'Nadie';
        victimInfo.innerHTML = `
            <h4>💀 Víctima de los Lobos</h4>
            <div class="victim-name">${victimName}</div>
            <p>¿Debe la bruja salvar a esta persona?</p>
        `;

        decisionDiv.appendChild(victimInfo);

        // Opciones de pociones
        const potionChoices = document.createElement('div');
        potionChoices.className = 'potion-choices';

        const healingOption = document.createElement('div');
        healingOption.className = 'potion-option healing';
        healingOption.innerHTML = `
            <div class="potion-icon">🧪</div>
            <div class="potion-text">Salvar</div>
        `;
        healingOption.onclick = () => confirmBrujaDecision(true, decisionDiv);

        const noActionOption = document.createElement('div');
        noActionOption.className = 'potion-option no-action';
        noActionOption.innerHTML = `
            <div class="potion-icon">❌</div>
            <div class="potion-text">No Salvar</div>
        `;
        noActionOption.onclick = () => confirmBrujaDecision(false, decisionDiv);

        potionChoices.appendChild(healingOption);
        potionChoices.appendChild(noActionOption);

        decisionDiv.appendChild(potionChoices);
        container.appendChild(decisionDiv);
    }, 3000);

    brujaAssignContainer.appendChild(container);
}

async function confirmBrujaDecision(shouldSave, container) {
    // Desactivar opciones
    const potionOptions = container.querySelectorAll('.potion-option');
    potionOptions.forEach(option => {
        option.style.pointerEvents = 'none';
        option.style.opacity = '0.6';
    });

    try {
        isSaved = shouldSave;

        if (shouldSave && playerKilled) {
            // Encontrar la bruja y reducir sus pociones
            const brujaEntry = Object.entries(gameData.players)
                .find(([id, player]) => player.role === 'bruja' && player.isAlive);
            
            if (brujaEntry) {
                const [brujaId, bruja] = brujaEntry;
                await update(ref(database, `games/${currentGame}/players/${brujaId}`), {
                    healPotionsLeft: (bruja.healPotionsLeft || 1) - 1
                });
            }

            await update(ref(database, `games/${currentGame}/playerKilled`), null);
        }

        // Mostrar resultado
        const resultDiv = document.createElement('div');
        resultDiv.className = 'host-instructions';
        resultDiv.innerHTML = `
            <h3>✨ Decisión de la Bruja</h3>
            <p>${shouldSave ? 'La bruja ha salvado a la víctima con su poción.' : 'La bruja ha decidido no intervenir esta noche.'}</p>
        `;

        container.appendChild(resultDiv);

        // Botón continuar
        const continueButton = document.createElement('button');
        continueButton.textContent = 'Continuar';
        continueButton.onclick = () => {
            document.getElementById('brujaAssignScreen').hidden = true;
            gameCycle();
        };
        container.appendChild(continueButton);

    } catch (error) {
        console.error("Error en decisión de bruja:", error);
        // Reactivar opciones si hay error
        potionOptions.forEach(option => {
            option.style.pointerEvents = 'auto';
            option.style.opacity = '1';
        });
    }
}

function updateAmanecerDiaUI(){
    const amanecerDiaContainer = document.getElementById('amanecerDiaScreen');
    amanecerDiaContainer.hidden = false;
    amanecerDiaContainer.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'host-phase-container';

    container.appendChild(createTimeIndicator(false)); // Es día

    const instructions = createHostInstructions(
        'Amanecer en el Pueblo',
        'La noche ha terminado y el pueblo despierta. Es hora de anunciar lo que ha ocurrido durante la noche.'
    );
    container.appendChild(instructions);

    const announceButton = document.createElement('button');
    announceButton.textContent = 'Anunciar Muerte de la Noche';
    announceButton.onclick = () => {
        amanecerDiaContainer.hidden = true;
        gameCycle();
    };
    container.appendChild(announceButton);

    amanecerDiaContainer.appendChild(container);
}

async function updateKillUI(){
    const currentPhase = gameData.phase;
    const muerteScreenContainer = document.getElementById('muerteScreen');
    
    // Limpiar el contenedor al inicio
    muerteScreenContainer.innerHTML = '';
    muerteScreenContainer.hidden = false;

    if(currentPhase === 'muerte_noche' || currentPhase === 'muerte_dia') {
        // Primera fase: Mostrar quién murió con carta
        const container = document.createElement('div');
        container.className = 'death-announcement-container';

        const content = document.createElement('div');
        content.className = 'death-announcement-content';

        // Título
        const title = document.createElement('h1');
        title.className = 'death-title';
        title.textContent = currentPhase === 'muerte_noche' ? '💀 Muerte en la Noche' : '⚖️ Ejecución del Pueblo';
        content.appendChild(title);

        // Nombre de la víctima
        const victimName = document.createElement('div');
        victimName.className = 'victim-name-display';
        victimName.textContent = `El jugador eliminado: ${playerKilled ? playerKilled.name : 'Nadie'}`;
        content.appendChild(victimName);

        if(playerKilled && playerKilled.name !== 'Nadie') {
            // Carta con dorso
            const roleRevealImage = document.createElement('img');
            roleRevealImage.className = 'death-card';
            roleRevealImage.id = 'playerKilledRoleRevealImage';
            roleRevealImage.src = 'images/back.png';
            content.appendChild(roleRevealImage);
        }
        
        const revealRoleButton = document.createElement('button');
        revealRoleButton.textContent = 'Revelar Rol del Jugador Eliminado';
        revealRoleButton.onclick = () => {
            if(playerKilled && playerKilled.name !== 'Nadie') {
                // Animar carta
                const card = document.getElementById('playerKilledRoleRevealImage');
                card.classList.add('flipped');
                
                setTimeout(() => {
                    card.src = `images/${playerKilled.role}.png`;
                }, 400);
            }
            gameCycle();
        };
        content.appendChild(revealRoleButton);

        container.appendChild(content);
        muerteScreenContainer.appendChild(container);
        
    } else if((currentPhase === 'anuncio_muerte_noche' || currentPhase === 'anuncio_muerte_dia') && playerKilled) {
        // Segunda fase: Tu lógica existente para efectos especiales
        const container = document.createElement('div');
        container.className = 'death-announcement-container';

        const content = document.createElement('div');
        content.className = 'death-announcement-content';

        const victimName = document.createElement('div');
        victimName.className = 'victim-name-display';
        victimName.textContent = `El jugador eliminado: ${playerKilled ? playerKilled.name : 'Nadie'}`;
        content.appendChild(victimName);

        if(playerKilled.name !== 'Nadie') {
            const playerKilledRoleRevealImage = document.createElement('img');
            playerKilledRoleRevealImage.className = 'death-card';
            playerKilledRoleRevealImage.id = 'playerKilledRoleRevealImage';
            playerKilledRoleRevealImage.src = `images/${playerKilled.role}.png`;
            content.appendChild(playerKilledRoleRevealImage);

            const roleDisplay = document.createElement('div');
            roleDisplay.className = 'victim-role-display';
            roleDisplay.textContent = `Era un ${playerKilled.role.charAt(0).toUpperCase() + playerKilled.role.slice(1)}`;
            content.appendChild(roleDisplay);
        }

        // Aquí mantener tu lógica existente para enamorados, cazador, etc.
        if(playerKilled.isInLove && !CoupleAnounced){
            CoupleAnounced = true;
            const loveMessage = document.createElement('div');
            loveMessage.className = 'victim-role-display';
            loveMessage.textContent = '¡El jugador eliminado estaba enamorado!';
            content.appendChild(loveMessage);
            
            const lovedPlayerId = Object.entries(gameData.players)
                .find(([_, player]) => player.isInLove && player.lovedPlayer === playerKilled.id)?.[0];
                
            const lovedPlayer = gameData.players[lovedPlayerId];

            if(playerKilled.role === 'cazador'){
                playerWasCazador = true;
            }

            const confirmButton = document.createElement('button');
            confirmButton.textContent = `Revelar enamorado: ${lovedPlayer.name}`;
            confirmButton.onclick = async () => {
                if(lovedPlayer) {
                    playerKilled = {
                        id: lovedPlayerId,
                        name: lovedPlayer.name,
                        role: lovedPlayer.role,
                        isInLove: lovedPlayer.isInLove,
                    };

                    let nextPhase = null;
                    if(currentPhase === 'anuncio_muerte_dia') {
                        nextPhase = 'muerte_dia';
                    } else if(currentPhase === 'anuncio_muerte_noche') {
                        nextPhase = 'muerte_noche';
                    }
                    try{
                        await update(ref(database, `games/${currentGame}/playerKilled`), playerKilled);
                        await update(ref(database, `games/${currentGame}`), {
                            phase: nextPhase
                        });
                    } catch (error) {
                        console.error("Error eliminando jugador enamorado:", error);
                    }
                }
            }
            content.appendChild(confirmButton);

        }
        else if(playerKilled.role === 'cazador' || playerWasCazador) {
            playerWasCazador = false;
            const textContent = document.createElement('div');
            textContent.className = 'victim-role-display';
            textContent.textContent = 'El cazador debe eliminar a otro jugador:';
            content.appendChild(textContent);
            
            const availablePlayers = Object.entries(gameData.players)
                .filter(([id, player]) => id !== gameData.host && player.isAlive && id !== playerKilled.id)
                .map(([id, player]) => ({ id, name: player.name }));

            const select = document.createElement('select');
            select.className = 'cazador-player-select';

            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = `Selecciona jugador eliminado por el cazador`;
            select.appendChild(defaultOption);

            availablePlayers.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = player.name;
                select.appendChild(option);
            }); 

            content.appendChild(select);

            const confirmButton = document.createElement('button');
            confirmButton.textContent = 'Confirmar Eliminación del Cazador';
            confirmButton.onclick = async () => {
                const selectedPlayerId = select.value;
                if(selectedPlayerId) {
                    playerKilled = {
                        id: selectedPlayerId,
                        name: gameData.players[selectedPlayerId].name,
                        role: gameData.players[selectedPlayerId].role,
                        isInLove: gameData.players[selectedPlayerId].isInLove,
                    };

                    let nextPhase = null;
                    if(currentPhase === 'anuncio_muerte_dia') {
                        nextPhase = 'muerte_dia';
                    } else if(currentPhase === 'anuncio_muerte_noche') {
                        nextPhase = 'muerte_noche';
                    }
                    try{
                        await update(ref(database, `games/${currentGame}/playerKilled`), playerKilled);
                        await update(ref(database, `games/${currentGame}`), {
                            phase: nextPhase
                        });
                    } catch (error) {
                        console.error("Error eliminando jugador del cazador:", error);
                    }
                }
            };
            content.appendChild(confirmButton);
            
        } else {
            const confirmButton = document.createElement('button');
            confirmButton.textContent = 'Continuar';
            confirmButton.onclick = async () => {
                await cleanupAfterDeath();
                gameCycle();
            };
            content.appendChild(confirmButton);
        }

        container.appendChild(content);
        muerteScreenContainer.appendChild(container);

        // Actualizar estado del jugador eliminado
        try{
            if(playerKilled && playerKilled.id !== 'skip') {
                await update(ref(database, `games/${currentGame}/players/${playerKilled.id}`), {
                    isAlive: false,
                });
            }
        } catch (error) {
            console.error("Error updating player status:", error);
        }
    }
}

// Función auxiliar para limpiar después de una muerte
async function cleanupAfterDeath() {
    // Preparar votación si es necesario
    if(gameData.phase === 'anuncio_muerte_noche') {
        await prepareVotacion();
    }
    
    // Limpiar variables globales
    playerKilled = null;
    isSaved = false;
    
    // Limpiar la base de datos
    try {
        await remove(ref(database, `games/${currentGame}/playerKilled`));
    } catch (error) {
        console.error("Error limpiando playerKilled:", error);
    }
}

async function prepareVotacion() {
    const votacionesJugadores = Object.entries(gameData.players)
                .filter(([id, player]) => id !== gameData.host && player.isAlive)
                .reduce((acc, [id, player]) => {
                    acc[id] = {votaciones : 0};
                    return acc;
                }, {});
    
    votacionesJugadores['skip'] = {votaciones: 0};
    
    await set(ref(database, `games/${currentGame}/votacionesJugadores`), votacionesJugadores);
}

function updateVoteDayUI(){
    const votacionScreenContainer = document.getElementById('votacionScreen');
    votacionScreenContainer.hidden = false;
    
    // Crear contenedor con nueva estética
    const container = document.createElement('div');
    container.className = 'day-voting-container';

    // Indicador de tiempo (día)
    const timeIndicator = document.createElement('div');
    timeIndicator.className = 'time-indicator day';
    timeIndicator.textContent = '☀️ DÍA';
    container.appendChild(timeIndicator);

    // Instrucciones
    const instructionsSection = document.createElement('div');
    instructionsSection.className = 'day-voting-instructions';
    instructionsSection.innerHTML = `
        <h3>⚖️ Votación del Pueblo</h3>
        <p>Los jugadores deben votar por un jugador para eliminar...</p>
    `;
    container.appendChild(instructionsSection);

    const availablePlayers = Object.entries(gameData.players)
        .filter(([id, player]) => id !== gameData.host && player.isAlive)
        .map(([id, player]) => ({ id, name: player.name }));

    const votos = Object.entries(gameData.votacionesJugadores).map(([id, data]) => ({
        id,
        name: availablePlayers.find(player => player.id === id)?.name || (id === 'skip' ? 'No votar por nadie' : 'Desconocido'),
        votaciones: data.votaciones
    }));

    // Sección de votos con mejor estética
    const votesSection = document.createElement('div');
    votesSection.className = 'day-voting-votes-section';
    
    const votesTitle = document.createElement('h3');
    votesTitle.textContent = '🗳️ Votos Actuales';
    votesSection.appendChild(votesTitle);

    const voteList = document.createElement('div');
    voteList.className = 'votes-grid';
    votos.forEach(voto => {
        const voteCard = document.createElement('div');
        voteCard.className = 'vote-card';
        
        // Nombre del jugador/opción
        const playerName = document.createElement('span');
        playerName.className = 'player-name';
        playerName.textContent = voto.name;
        voteCard.appendChild(playerName);
        
        // Contenedor para votos y botón
        const voteControls = document.createElement('div');
        voteControls.className = 'vote-controls';
        
        // Contador de votos
        const voteCount = document.createElement('span');
        voteCount.className = 'vote-count';
        voteCount.textContent = voto.votaciones;
        voteControls.appendChild(voteCount);
        
        // Si es host, añadir botón (+)
        if (isHost) {
            const addButton = document.createElement('button');
            addButton.className = 'add-vote-button';
            addButton.textContent = '+';
            addButton.title = 'Añadir voto';
            addButton.onclick = async () => {
                try {
                    // Incrementar voto
                    const currentVotes = gameData.votacionesJugadores[voto.id].votaciones || 0;
                    await update(ref(database, `games/${currentGame}/votacionesJugadores/${voto.id}`), {
                        votaciones: currentVotes + 1
                    });
                    
                    // Mostrar confirmación visual breve
                    addButton.classList.add('vote-added');
                    setTimeout(() => addButton.classList.remove('vote-added'), 300);
                } catch (error) {
                    console.error("Error al añadir voto:", error);
                }
            };
            voteControls.appendChild(addButton);
        }
        
        voteCard.appendChild(voteControls);
        voteList.appendChild(voteCard);
    });

    votesSection.appendChild(voteList);
    container.appendChild(votesSection);

    let votacionesTotales = 0;
    Object.entries(gameData.votacionesJugadores || {}).forEach(([id, votaciones]) => {
        if(id !== gameData.host) {
            votacionesTotales += votaciones.votaciones || 0;
        }
    });

    let numberPlayersAlive = 0;
    Object.entries(gameData.players || {}).forEach(([id, player]) => {
        if(id !== gameData.host && player.isAlive) {
            numberPlayersAlive++;
        }
    });

    if(gameconfiguration.alguacil && gameData.players[alguacilId]?.isAlive) {
        numberPlayersAlive++;
    }

    if(votacionesTotales < numberPlayersAlive){
        const waitingSection = document.createElement('div');
        waitingSection.className = 'day-voting-waiting';
        waitingSection.innerHTML = `
            <p>Esperando a que todos los jugadores voten... (${votacionesTotales}/${numberPlayersAlive})</p>
        `;
        container.appendChild(waitingSection);
    } else {
        const maxVotos = Math.max(...Object.values(gameData.votacionesJugadores)
            .map(v => v.votaciones));
        
        const jugadoresEliminados = Object.entries(gameData.votacionesJugadores)
            .filter(([id, data]) => data.votaciones === maxVotos);

        const selectionSection = document.createElement('div');
        selectionSection.className = 'day-voting-selection-section';
        
        const selectionTitle = document.createElement('h3');
        selectionTitle.textContent = '⚖️ Seleccionar Ejecutado';
        selectionSection.appendChild(selectionTitle);

        const select = document.createElement('select');
        select.className = 'voting-player-select';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = `Selecciona el jugador eliminado por votación`;
        defaultOption.style.display = 'none';
        select.appendChild(defaultOption);

        jugadoresEliminados.forEach(([id, data]) => {
            const option = document.createElement('option');
            option.value = id;
            if(id === 'skip') {
                option.textContent = `Nadie (Vote Skip)`;
            } else {
                option.textContent = gameData.players[id].name;
            }
            select.appendChild(option);
        });

        selectionSection.appendChild(select);

        const confirmButton = document.createElement('button');
        confirmButton.textContent = 'Confirmar Eliminación';
        confirmButton.onclick = async () => {
            const selectedPlayerId = select.value;
            if(selectedPlayerId) {
                if(selectedPlayerId === 'skip') {
                    playerKilled = {
                        id: 'skip',
                        name: 'Nadie',
                        role: 'ninguno',
                        isInLove: false,
                    }
                } else {
                    playerKilled = {
                        id: selectedPlayerId,
                        name: gameData.players[selectedPlayerId].name,
                        role: gameData.players[selectedPlayerId].role,
                        isInLove: gameData.players[selectedPlayerId].isInLove,
                    }
                }

                try{
                    await update(ref(database, `games/${currentGame}/playerKilled`), playerKilled);
                } catch (error) {
                    console.error("Error al actualizar la base de datos:", error);
                }
            }
            gameCycle();
        }

        selectionSection.appendChild(confirmButton);
        container.appendChild(selectionSection);
    }

    votacionScreenContainer.innerHTML = '';
    votacionScreenContainer.appendChild(container);
}

/////////////////////    PLAYER GAME SCREENS     ////////////////////

function hideAllPlayerGameScreens() {
    const playerGameScreens = document.querySelectorAll('#playerGameScreen > div');

    playerGameScreens.forEach(screen => {
        /*if(screen.id !== 'playerDeadScreen') {*/
            screen.hidden = true;
            screen.innerHTML = ''; 
        //}
    });
}

function showNightScreen() {
    toggleDayNight(false); // Cambiar a tema de noche
    
    const nightScreenContainer = document.getElementById('nightScreen');
    nightScreenContainer.hidden = false;
    nightScreenContainer.innerHTML = `<h2>Buenas noches...</h2>`;
}

function showDayScreen() {
    toggleDayNight(true); // Cambiar a tema de día
    
    const dayScreenContainer = document.getElementById('dayScreen');
    dayScreenContainer.hidden = false;
    dayScreenContainer.innerHTML = `<h2>Buenos días...</h2>`;
}

function showDeathScreen() {
    const currentPhase = gameData.phase;
    playerKilled = gameData.playerKilled;
    
    const deathScreenContainer = document.getElementById('deathScreen');
    deathScreenContainer.hidden = false;
    deathScreenContainer.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'death-announcement-container';

    const content = document.createElement('div');
    content.className = 'death-announcement-content';

    if(currentPhase === 'muerte_noche' || currentPhase === 'muerte_dia') {
        // PRIMERA FASE: Mostrar quién murió con carta de dorso (igual que host)
        
        // Título
        const title = document.createElement('h1');
        title.className = 'death-title';
        title.textContent = currentPhase === 'muerte_noche' ? '💀 Muerte en la Noche' : '⚖️ Ejecución del Pueblo';
        content.appendChild(title);

        // Nombre de la víctima
        const victimName = document.createElement('div');
        victimName.className = 'victim-name-display';
        victimName.textContent = `El jugador eliminado: ${playerKilled ? playerKilled.name : 'Nadie'}`;
        content.appendChild(victimName);

        if(playerKilled && playerKilled.name !== 'Nadie') {
            // Carta con dorso
            const roleRevealImage = document.createElement('img');
            roleRevealImage.className = 'death-card';
            roleRevealImage.id = 'playerKilledRoleRevealImage';
            roleRevealImage.src = 'images/back.png';
            content.appendChild(roleRevealImage);
        }
        
        // IMPORTANTE: Los jugadores NO tienen botón, solo ven la carta
        // El host maneja la transición, los jugadores solo observan
        
    } else if((currentPhase === 'anuncio_muerte_noche' || currentPhase === 'anuncio_muerte_dia') && playerKilled) {
        // SEGUNDA FASE: Mostrar rol revelado y efectos especiales (igual que host)
        
        // Título
        const title = document.createElement('h1');
        title.className = 'death-title';
        title.textContent = currentPhase === 'anuncio_muerte_noche' ? '💀 Muerte en la Noche' : '⚖️ Ejecución del Pueblo';
        content.appendChild(title);

        // Nombre de la víctima
        const victimName = document.createElement('div');
        victimName.className = 'victim-name-display';
        victimName.textContent = `El jugador eliminado: ${playerKilled ? playerKilled.name : 'Nadie'}`;
        content.appendChild(victimName);

        if(playerKilled.name !== 'Nadie') {
            // Carta ya revelada con animación
            const playerKilledRoleRevealImage = document.createElement('img');
            playerKilledRoleRevealImage.className = 'death-card';
            playerKilledRoleRevealImage.id = 'playerKilledRoleRevealImage';
            playerKilledRoleRevealImage.src = `images/${playerKilled.role}.png`;
            content.appendChild(playerKilledRoleRevealImage);

            const roleDisplay = document.createElement('div');
            roleDisplay.className = 'victim-role-display';
            roleDisplay.textContent = `Era un ${playerKilled.role.charAt(0).toUpperCase() + playerKilled.role.slice(1)}`;
            content.appendChild(roleDisplay);
        }

        // Mostrar efectos especiales si los hay (enamorados, etc.)
        if(playerKilled.isInLove && !CoupleAnounced){
            const loveMessage = document.createElement('div');
            loveMessage.className = 'victim-role-display';
            loveMessage.textContent = '¡El jugador eliminado estaba enamorado!';
            loveMessage.style.color = '#ff69b4';
            loveMessage.style.marginTop = '15px';
            content.appendChild(loveMessage);
            
            const lovedPlayerId = Object.entries(gameData.players)
                .find(([_, player]) => player.isInLove && player.lovedPlayer === playerKilled.id)?.[0];
                
            if(lovedPlayerId) {
                const lovedPlayer = gameData.players[lovedPlayerId];
                const loveInfo = document.createElement('div');
                loveInfo.className = 'victim-role-display';
                loveInfo.textContent = `Su pareja ${lovedPlayer.name} morirá también...`;
                loveInfo.style.fontSize = '1.1rem';
                loveInfo.style.marginTop = '10px';
                content.appendChild(loveInfo);
            }
        }

        if(playerKilled.role === 'cazador' || playerWasCazador) {
            const cazadorMessage = document.createElement('div');
            cazadorMessage.className = 'victim-role-display';
            cazadorMessage.textContent = 'El cazador disparará su última bala antes de morir...';
            cazadorMessage.style.color = `var(--danger-color)`;
            cazadorMessage.style.marginTop = '15px';
            content.appendChild(cazadorMessage);
        }

        playerKilled = null;
        isSaved = false;
    }

    container.appendChild(content);
    deathScreenContainer.appendChild(container);
}

function showVoteScreen() {
    const voteScreenContainer = document.getElementById('voteScreen');
    voteScreenContainer.hidden = false;

    voteScreenContainer.innerHTML = `<h2>Votación del día</h2>`;

    const availablePlayers = Object.entries(gameData.players)
        .filter(([id, player]) => id !== gameData.host && player.isAlive)
        .map(([id, player]) => ({ id, name: player.name }));

    const select = document.createElement('select');
    select.className = 'vote-player-select';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = `Vota a un jugador`;
    defaultOption.style.display = 'none'; 
    select.appendChild(defaultOption);

    availablePlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = player.name;
        select.appendChild(option);
    }); 

    const option = document.createElement('option');
    option.value = 'skip';
    option.textContent = `No votar por nadie`;
    select.appendChild(option);

    select.addEventListener('change', function() {
        handleVoteDay(this);
    });

    voteScreenContainer.appendChild(select);
}

window.handleVoteDay = async (select) => {
    const selectedPlayerId = select.value;
    if(!selectedPlayerId) {
        return;
    }

    //select.style.display = 'none';
    const selectObject = document.getElementsByClassName('vote-player-select')[0];
    selectObject.style.display = 'none';

    // Guardar referencias ANTES del await
    const container = select.parentElement;
    const playerName = select.options[select.selectedIndex].textContent;
    
    if (!container) {
        console.warn('Container no encontrado, el select fue eliminado del DOM');
        return;
    }

    let votacionesActuales = gameData.votacionesJugadores[selectedPlayerId].votaciones || 0;
    let nuevasVotaciones = votacionesActuales + 1;

    if(gameData.players[playerID].isAlguacil) { //Si es alguacil, el voto vale por 2
        nuevasVotaciones = nuevasVotaciones + 1;
    }

    await update(ref(database, `games/${currentGame}/votacionesJugadores/${selectedPlayerId}`), {
        votaciones: nuevasVotaciones
    });

    // Verificar que el container aún existe
    if (!container.parentNode) {
        console.warn('Container fue removido del DOM durante la operación async');
        return;
    }

    const assignedPlayer = document.createElement('div');
    assignedPlayer.className = 'assigned-player';
    assignedPlayer.innerHTML = `
        <span>Has votado por: ${playerName}</span>
    `;

    container.appendChild(assignedPlayer);
}

function showDeathPlayerScreen(){ 
    const playerDeadScreenContainer = document.getElementById('playerDeadScreen');
    playerDeadScreenContainer.hidden = false;
    playerDeadScreenContainer.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'player-death-container';

    const content = document.createElement('div');
    content.className = 'player-death-content';

    // Icono de muerte
    const deathIcon = document.createElement('div');
    deathIcon.className = 'player-death-icon';
    deathIcon.textContent = '💀';
    content.appendChild(deathIcon);

    // Título
    const title = document.createElement('h1');
    title.className = 'player-death-title';
    title.textContent = 'Has Muerto';
    content.appendChild(title);

    // Mensaje
    const message = document.createElement('p');
    message.className = 'player-death-message';
    message.textContent = 'Tu aventura en el pueblo ha llegado a su fin. Observa cómo continúa la partida desde las sombras...';
    content.appendChild(message);

    // Tu rol
    if (gameData.players[playerID] && gameData.players[playerID].role) {
        const roleInfo = document.createElement('div');
        roleInfo.className = 'player-death-role';
        roleInfo.innerHTML = `
            <p>Tu rol era:</p>
            <div class="role-name">${gameData.players[playerID].role.charAt(0).toUpperCase() + gameData.players[playerID].role.slice(1)}</div>
        `;
        content.appendChild(roleInfo);
    }

    container.appendChild(content);
    playerDeadScreenContainer.appendChild(container);
}

function isBrujaAlive(){
    const playerList = gameData.players || {};
    return Object.values(playerList).some(player => player.role === 'bruja' && player.isAlive && player.healPotionsLeft > 0);
}

function isVidenteAlive(){
    const playerList = gameData.players || {};
    return Object.values(playerList).some(player => player.role === 'vidente' && player.isAlive);
}

function isLoboAlive(){
    const playerList = gameData.players || {};
    return Object.values(playerList).some(player => player.role === 'lobo' && player.isAlive);
}

function isMoreLobosThanAldeanos(){
    const playerList = gameData.players || {};
    const lobosCount = Object.values(playerList).filter(player => player.role === 'lobo' && player.isAlive).length;
    const aldeanosCount = Object.values(playerList).filter(player => player.role !== 'lobo' && !player.isHost && player.isAlive).length;

    return lobosCount >= aldeanosCount;
}

function handleGameEnd(endPhase) {
    if(isHost) {
        showHostGameEndScreen(endPhase);
    } else {
        showPlayerGameEndScreen(endPhase);
    }
}

function showHostGameEndScreen(endPhase) {
    hideAllHostGameScreens();
    
    const gameEndContainer = document.getElementById('ganadorScreen');
    gameEndContainer.hidden = false;
    gameEndContainer.innerHTML = '';
    
    // Crear overlay de pantalla completa
    const victoryOverlay = document.createElement('div');
    victoryOverlay.className = `victory-container ${endPhase === 'victoria_lobos' ? 'victory-wolves' : 'victory-villagers'}`;

    const victoryContent = document.createElement('div');
    victoryContent.className = 'victory-content';

    // Icono y títulos
    const victoryIcon = document.createElement('span');
    victoryIcon.className = 'victory-icon';
    victoryIcon.textContent = endPhase === 'victoria_lobos' ? '🐺' : '🏘️';
    victoryContent.appendChild(victoryIcon);

    const titleElement = document.createElement('h1');
    titleElement.className = 'victory-title';
    const descriptionElement = document.createElement('p');
    descriptionElement.className = 'victory-subtitle';
    
    if (endPhase === 'victoria_lobos') {
        titleElement.textContent = '¡LOS LOBOS HAN GANADO!';
        descriptionElement.textContent = 'Los lobos han eliminado a suficientes aldeanos para tomar el control del pueblo.';
    } else if (endPhase === 'victoria_aldeanos') {
        titleElement.textContent = '¡EL PUEBLO HA GANADO!';
        descriptionElement.textContent = 'Los aldeanos han logrado eliminar a todos los lobos y salvar el pueblo.';
    }

    victoryContent.appendChild(titleElement);
    victoryContent.appendChild(descriptionElement);

    // Botón para volver al lobby
    const backLobbySection = document.createElement('div');
    backLobbySection.className = 'back-lobby-section';

    const backToLobbyButton = document.createElement('button');
    backToLobbyButton.textContent = 'Volver al Lobby';
    backToLobbyButton.className = 'back-lobby-btn';
    backToLobbyButton.onclick = backToLobby;
    
    backLobbySection.appendChild(backToLobbyButton);
    victoryContent.appendChild(backLobbySection);

    // Mostrar roles finales
    const statsSection = document.createElement('div');
    statsSection.className = 'stats-section';

    const rolesTitle = document.createElement('h2');
    rolesTitle.className = 'stats-title';
    rolesTitle.textContent = '📊 Roles de los jugadores:';
    statsSection.appendChild(rolesTitle);

    const rolesList = document.createElement('div');
    rolesList.className = 'stats-grid';
    
    Object.entries(gameData.players).forEach(([id, player]) => {
        if (!player.isHost) {
            const statCard = document.createElement('div');
            statCard.className = 'stat-card';
            statCard.innerHTML = `
                <div class="stat-name">${player.name}</div>
                <div class="stat-role">${player.role.charAt(0).toUpperCase() + player.role.slice(1)}</div>
                <div class="stat-status ${player.isAlive ? 'alive' : 'dead'}">
                    ${player.isAlive ? '✅ Vivo' : '💀 Muerto'}
                </div>
            `;
            rolesList.appendChild(statCard);
        }
    });
    
    statsSection.appendChild(rolesList);
    victoryContent.appendChild(statsSection);

    victoryOverlay.appendChild(victoryContent);
    gameEndContainer.appendChild(victoryOverlay);
}

function showPlayerGameEndScreen(endPhase) {
    hideAllPlayerGameScreens();
    
    const gameEndScreen = document.getElementById('playerGameEndScreen');
    gameEndScreen.hidden = false;
    gameEndScreen.innerHTML = '';
    
    // Usar el mismo diseño que el host pero sin botón
    const victoryOverlay = document.createElement('div');
    victoryOverlay.className = `victory-container ${endPhase === 'victoria_lobos' ? 'victory-wolves' : 'victory-villagers'}`;

    const victoryContent = document.createElement('div');
    victoryContent.className = 'victory-content';

    const victoryIcon = document.createElement('span');
    victoryIcon.className = 'victory-icon';
    victoryIcon.textContent = endPhase === 'victoria_lobos' ? '🐺' : '🏘️';
    victoryContent.appendChild(victoryIcon);

    const titleElement = document.createElement('h1');
    titleElement.className = 'victory-title';
    const descriptionElement = document.createElement('p');
    descriptionElement.className = 'victory-subtitle';
    
    if (endPhase === 'victoria_lobos') {
        titleElement.textContent = '¡LOS LOBOS HAN GANADO!';
        descriptionElement.textContent = 'Los lobos han eliminado a suficientes aldeanos para tomar el control del pueblo.';
    } else if (endPhase === 'victoria_aldeanos') {
        titleElement.textContent = '¡EL PUEBLO HA GANADO!';
        descriptionElement.textContent = 'Los aldeanos han logrado eliminar a todos los lobos y salvar el pueblo.';
    }
    
    victoryContent.appendChild(titleElement);
    victoryContent.appendChild(descriptionElement);
    
    // Mostrar tu rol
    const playerRole = gameData.players[playerID].role;
    const yourRoleElement = document.createElement('div');
    yourRoleElement.className = 'stats-section';
    yourRoleElement.innerHTML = `
        <h3 class="stats-title">Tu rol era: ${playerRole.charAt(0).toUpperCase() + playerRole.slice(1)}</h3>
        <img src="images/${playerRole}.png" alt="${playerRole}" style="width: 100px; height: auto; border-radius: 10px; margin: 10px 0;">
    `;
    victoryContent.appendChild(yourRoleElement);
    
    // Mostrar roles finales
    const statsSection = document.createElement('div');
    statsSection.className = 'stats-section';

    const rolesTitle = document.createElement('h2');
    rolesTitle.className = 'stats-title';
    rolesTitle.textContent = 'Roles de todos los jugadores:';
    statsSection.appendChild(rolesTitle);
    
    const rolesList = document.createElement('div');
    rolesList.className = 'stats-grid';
    
    Object.entries(gameData.players).forEach(([id, player]) => {
        if (!player.isHost) {
            const statCard = document.createElement('div');
            statCard.className = 'stat-card';
            statCard.innerHTML = `
                <div class="stat-name">${player.name}${id === playerID ? ' (tú)' : ''}</div>
                <div class="stat-role">${player.role.charAt(0).toUpperCase() + player.role.slice(1)}</div>
                <div class="stat-status ${player.isAlive ? 'alive' : 'dead'}">
                    ${player.isAlive ? '✅ Vivo' : '💀 Muerto'}
                </div>
            `;
            rolesList.appendChild(statCard);
        }
    });
    
    statsSection.appendChild(rolesList);
    victoryContent.appendChild(statsSection);
    
    // Mensaje de espera
    const waitingMessage = document.createElement('p');
    waitingMessage.textContent = 'Esperando a que el anfitrión decida si volver al lobby...';
    waitingMessage.className = 'victory-subtitle';
    victoryContent.appendChild(waitingMessage);

    victoryOverlay.appendChild(victoryContent);
    gameEndScreen.appendChild(victoryOverlay);
}

window.backToLobby = async () => {
    if (!isHost) {
        console.error('Solo el anfitrión puede volver al lobby');
        return;
    }
    
    try {
        // Restablecer el estado de todos los jugadores
        const resetPlayerPromises = Object.keys(gameData.players).map(async (playerId) => {
            if (!gameData.players[playerId].isHost) {
                await update(ref(database, `games/${currentGame}/players/${playerId}`), {
                    isAlive: true,
                    role: null,
                    roleShown: false,
                    isInLove: false,
                    alguacil: false,
                    healPotionsLeft: null,
                    lovedPlayer: null
                });
            } else {
                // Solo resetear algunos campos del host
                await update(ref(database, `games/${currentGame}/players/${playerId}`), {
                    isAlive: true,
                    role: null,
                    roleShown: false,
                    isInLove: false,
                    alguacil: false,
                    healPotionsLeft: null,
                    lovedPlayer: null
                });
            }
        });
        
        await Promise.all(resetPlayerPromises);
        
        // Limpiar datos del juego
        await Promise.all([
            remove(ref(database, `games/${currentGame}/playerKilled`)),
            remove(ref(database, `games/${currentGame}/votacionesJugadores`)),
            remove(ref(database, `games/${currentGame}/votacionesAlguacil`))
        ]);
        
        // Actualizar el estado del juego
        await update(ref(database, `games/${currentGame}`), {
            status: 'lobby',
            phase: 'lobby'
        });
        
        // Cambiar de vuelta al tema nocturno
        toggleDayNight(false);
        
        // NUEVA LIMPIEZA COMPLETA
        cleanupAllGameScreens();
        
        // Volver al listener del lobby original
        startGameListener();
        showScreen('lobbyScreen');
        
    } catch (error) {
        console.error('Error al volver al lobby:', error);
    }
}

function cleanupAllGameScreens() {
    // Limpiar pantallas de asignación de roles
    const roleAssignScreens = [
        'playersWait', 'hostWait', 'hostConfigurationRoles', 
        'roleReveal', 'alguacilAssign', 'alguacilShow'
    ];
    
    roleAssignScreens.forEach(screenId => {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.innerHTML = '';
            screen.hidden = true;
        }
    });

    // Limpiar pantallas del host durante el juego
    const hostGameScreens = [
        'cupidoAssignScreen', 'videnteAssignScreen', 'loboAssignScreen',
        'brujaAssignScreen', 'amanecerDiaScreen', 'muerteScreen',
        'votacionScreen', 'ganadorScreen'
    ];
    
    hostGameScreens.forEach(screenId => {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.innerHTML = '';
            screen.hidden = true;
        }
    });

    // Limpiar pantallas de jugadores durante el juego
    const playerGameScreens = [
        'nightScreen', 'dayScreen', 'deathScreen', 
        'voteScreen', 'playerDeadScreen', 'playerGameEndScreen'
    ];
    
    playerGameScreens.forEach(screenId => {
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.innerHTML = '';
            screen.hidden = true;
        }
    });

    // Remover overlays de victoria
    const victoryOverlays = document.querySelectorAll('.victory-container');
    victoryOverlays.forEach(overlay => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    });

    // Limpiar variables globales del juego
    playerKilled = null;
    isSaved = false;
    previousPhase = '';
    playerWasCazador = false;
    CoupleAnounced = false;
    roleAssignment = {};
}

// Función auxiliar para asegurar que los listeners se reseteen correctamente
function resetGameListeners() {
    if(gameListener) {
        off(gameListener);
        gameListener = null;
    }
}

function toggleDayNight(isDay) {
    if (isDay) {
        document.body.classList.add('day-theme');
    } else {
        document.body.classList.remove('day-theme');
    }
}

function updateThemeBasedOnPhase(currentPhase) {
    // Fases de día
    const dayPhases = [
        'amanecer_dia', 
        'votacion_dia', 
        'muerte_dia', 
        'anuncio_muerte_dia'
    ];
    
    // Fases de noche (resto de fases)
    const nightPhases = [
        'cupido_assign',
        'vidente_turn', 
        'lobo_turn', 
        'bruja_turn',
        'muerte_noche',
        'anuncio_muerte_noche'
    ];
    
    if (dayPhases.includes(currentPhase)) {
        toggleDayNight(true);
    } else if (nightPhases.includes(currentPhase)) {
        toggleDayNight(false);
    }
    // Para otras fases (lobby, role_assign, etc.) mantener tema nocturno por defecto
}



