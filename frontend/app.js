const socket = io('http://localhost:3001'); // Puerto correcto del backend

// Eventos básicos de conexión
socket.on('connect', () => {
    console.log('✅ Conectado al servidor');
    
    // Enviar información del usuario al conectarse
    if (currentUser) {
        socket.emit('user:join', {
            username: currentUser.username,
            balance: playerBalance,
            betting: false
        });
    } else {
        // Usuario temporal para desarrollo
        socket.emit('user:join', {
            username: 'Piloto',
            balance: playerBalance,
            betting: false
        });
    }
});

socket.on('disconnect', () => {
    console.log('❌ Desconectado del servidor');
});

// Escuchar actualizaciones del juego
socket.on('round:update',         // Execute cashout - Solo envía evento al servidor
        function executeCashout() {
            if (gamePhase !== 'in_flight') {
                alert('⚠️ No puedes hacer cashout ahora');
                return;
            }
            
            if (!betActive) {
                alert('⚠️ No tienes ninguna apuesta activa');
                return;
            }

            // Enviar cashout al servidor - el servidor calculará las ganancias
            socket.emit('bet:cashout', {
                username: currentUser?.username || 'Piloto',
                multiplier: currentAltitude
            });
            
            console.log('💰 Enviando cashout al servidor en:', currentAltitude.toFixed(3) + 'x');
        }

        // Execute cancel bet - Solo envía evento al servidor
        function executeCancelBet() {
            if (gamePhase !== 'betting_open') {
                alert('⚠️ No puedes cancelar la apuesta ahora');
                return;
            }
            
            if (!betActive) {
                alert('⚠️ No tienes ninguna apuesta activa para cancelar');
                return;
            }

            // Confirmar cancelación
            if (!confirm('¿Estás seguro de que quieres cancelar tu apuesta?')) {
                return;
            }

            // Enviar cancelación al servidor
            socket.emit('bet:cancel', {
                username: currentUser?.username || 'Piloto'
            });
            
            console.log('❌ Enviando cancelación de apuesta al servidor');
        }sole.log('🎮 Estado del juego:', data);
    updateGameState(data);
});

socket.on('round:crash', (data) => {
    console.log('💥 Crash en:', data.crashPoint + 'x');
    handleCrash(data);
});

// Escuchar lista de usuarios conectados
socket.on('users:list', (users) => {
    console.log('👥 Usuarios conectados:', users);
    updateUsersList(users);
});

// Escuchar cuando un usuario se conecta
socket.on('user:connected', (user) => {
    console.log('✅ Usuario conectado:', user.username);
});

// Escuchar cuando un usuario se desconecta
socket.on('user:disconnected', (user) => {
    console.log('❌ Usuario desconectado:', user.username);
});

// Eventos de apuestas del servidor
socket.on('bet:placed', (data) => {
    console.log('🎯 Apuesta colocada:', data);
    if (data.success) {
        betActive = true;
        betValue = data.amount;
        playerBalance = data.newBalance;
        updateDisplay();
    } else {
        alert('❌ Error al colocar apuesta: ' + data.message);
    }
});

socket.on('bet:cashout', (data) => {
    console.log('💰 Cashout realizado:', data);
    if (data.success) {
        betActive = false;
        playerBalance = data.newBalance;
        gameStatistics.totalProfit += data.profit;
        updateDisplay();
        displayWinEffect(data.profit);
    }
});

socket.on('balance:update', (data) => {
    console.log('💰 Balance actualizado:', data);
    playerBalance = data.balance;
    updateDisplay();
});

// Evento de cancelación de apuesta
socket.on('bet:cancelled', (data) => {
    console.log('❌ Apuesta cancelada:', data);
    if (data.success) {
        betActive = false;
        playerBalance = data.newBalance;
        updateDisplay();
        
        // Mostrar mensaje de cancelación
        alert(`✅ Apuesta cancelada. Se devolvieron $${data.refundedAmount.toFixed(2)} a tu balance.`);
    } else {
        alert('❌ Error al cancelar apuesta: ' + data.message);
    }
});

// Funciones para actualizar la UI basado en datos del servidor
function updateGameState(data) {
    // Actualizar estado del vuelo
    const statusElement = document.getElementById('flightStatus');
    const multiplierElement = document.getElementById('altitudeMultiplier');
    
    // Actualizar fase del juego local solo para UI
    if (data.state) {
        gamePhase = data.state;
        const statusMap = {
            'waiting': '🟡 Preparando vuelo...',
            'betting_open': '🟢 ¡Apuestas abiertas!',
            'betting_closed': '🟠 Apuestas cerradas',
            'in_flight': '🚀 Vuelo en progreso',
            'crash': '💥 ¡Crash!',
            'settlement': '📊 Liquidando...'
        };
        statusElement.textContent = statusMap[data.state];
        statusElement.className = `status-${data.state}`;
        
        // Controlar UI de apuestas basado en estado del servidor
        updateBettingUI(data.state);
    }
    
    if (data.multiplier) {
        currentAltitude = data.multiplier;
        multiplierElement.textContent = data.multiplier.toFixed(3) + 'x';
        
        // Animar cohete basado en datos del servidor
        if (data.state === 'in_flight') {
            animateRocket(data.multiplier);
            createRocketTrail();
        }
    }
    
    // Actualizar información de la ronda si está disponible
    if (data.roundId) {
        console.log('Round ID:', data.roundId);
    }
}

function handleCrash(data) {
    // Mostrar el crash final
    const multiplierElement = document.getElementById('altitudeMultiplier');
    multiplierElement.textContent = data.crashPoint.toFixed(3) + 'x';
    multiplierElement.style.color = 'red';
    multiplierElement.classList.add('crashed-effect');
    
    // Crear animación de crash
    createCrashAnimation();
    
    // Agregar a historial local
    flightHistory.unshift(data.crashPoint);
    if (flightHistory.length > 20) flightHistory.pop();
    
    // Actualizar estadísticas locales
    gameStatistics.totalFlights++;
    if (data.crashPoint > gameStatistics.bestAltitude) {
        gameStatistics.bestAltitude = data.crashPoint;
    }
    
    // Resetear color y efectos después de animación
    setTimeout(() => {
        multiplierElement.style.color = '';
        multiplierElement.classList.remove('crashed-effect');
        resetRocketPosition();
    }, 2000);
    
    // Actualizar display
    updateDisplay();
}

// Función para controlar UI de apuestas basado en estado del servidor
function updateBettingUI(gameState) {
    const betBtn = document.getElementById('betBtn1');
    const cashBtn = document.getElementById('cashBtn1');
    const cancelBtn = document.getElementById('cancelBtn1');
    const betAmount = document.getElementById('betAmount1');
    
    switch(gameState) {
        case 'waiting':
        case 'betting_open':
            // Permitir apuestas o cancelar si ya apostó
            if (betActive) {
                betBtn.style.display = 'none';
                cashBtn.style.display = 'none';
                cancelBtn.style.display = 'block';
            } else {
                betBtn.style.display = 'block';
                cashBtn.style.display = 'none';
                cancelBtn.style.display = 'none';
            }
            betAmount.disabled = betActive;
            break;
            
        case 'betting_closed':
            // No permitir nuevas apuestas ni cancelar
            betBtn.style.display = 'none';
            cashBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            betAmount.disabled = true;
            break;
            
        case 'in_flight':
            // Mostrar botón de cashout si hay apuesta activa
            betBtn.style.display = 'none';
            cashBtn.style.display = betActive ? 'block' : 'none';
            cancelBtn.style.display = 'none';
            betAmount.disabled = true;
            break;
            
        case 'crash':
        case 'settlement':
            // Ocultar todos los botones durante liquidación
            betBtn.style.display = 'none';
            cashBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            betAmount.disabled = true;
            break;
    }
}

// Función para resetear posición del cohete
function resetRocketPosition() {
    const rocket = document.getElementById('rocketShip');
    const trail = document.getElementById('rocketTrail');
    
    rocket.style.left = '5%';
    rocket.style.bottom = '15%';
    rocket.style.transform = 'rotate(0deg) scale(1)';
    rocket.classList.remove('rocket-crash');
    
    // Limpiar trail
    if (trail) {
        trail.innerHTML = '';
    }
}

// Función para animar cohete basado en multiplicador del servidor
function animateRocket(multiplier) {
    const rocket = document.getElementById('rocketShip');
    if (!rocket) return;
    
    const progress = Math.min((multiplier - 1) * 15, 75);
    const verticalProgress = Math.min((multiplier - 1) * 10, 60);
    
    rocket.style.left = progress + '%';
    rocket.style.bottom = (15 + verticalProgress) + '%';
    rocket.style.transform = `rotate(${progress * 0.4}deg) scale(${1 + progress * 0.005})`;
}

// Game state variables
        let gamePhase = 'waiting'; // waiting, flying, crashed
        let currentAltitude = 1.00;
        let flightHistory = [];
        let playerBalance = 1000.00;
        let betActive = false;
        let betValue = 0;
        let gameStatistics = {
            totalFlights: 0,
            totalProfit: 0,
            bestAltitude: 0
        };
        let currentUser = null;
        let connectedUsers = []; // Lista de usuarios conectados

        // Check authentication and load user data
        function checkAuthentication() {
            if (typeof window.SkyBetAuth !== 'undefined') {
                currentUser = window.SkyBetAuth.getCurrentUser();
                
                if (!currentUser) {
                    // Redirect to login if not authenticated
                    window.location.href = 'login.html';
                    return false;
                }
                
                // Load user data
                playerBalance = currentUser.balance || 1000.00;
                gameStatistics = currentUser.stats || {
                    totalFlights: 0,
                    totalProfit: 0,
                    bestAltitude: 0
                };
                
                // Update player name display
                document.getElementById('playerName').textContent = currentUser.username;
                
                return true;
            }
            return true; // Fallback for when auth system is not loaded
        }

        // Save user progress
        function saveUserProgress() {
            if (currentUser && typeof window.SkyBetAuth !== 'undefined') {
                currentUser.balance = playerBalance;
                currentUser.stats = gameStatistics;
                
                // Update localStorage
                localStorage.setItem('skybet_current_user', JSON.stringify(currentUser));
                
                // Update users database
                const users = JSON.parse(localStorage.getItem('skybet_users')) || [];
                const userIndex = users.findIndex(u => u.username === currentUser.username);
                if (userIndex !== -1) {
                    users[userIndex] = currentUser;
                    localStorage.setItem('skybet_users', JSON.stringify(users));
                }
            }
        }

        // DOM references
        const refs = {
            rocketShip: document.getElementById('rocketShip'),
            rocketTrail: document.getElementById('rocketTrail'),
            altitudeMultiplier: document.getElementById('altitudeMultiplier'),
            flightStatus: document.getElementById('flightStatus'),
            userBalance: document.getElementById('userBalance'),
            betBtn1: document.getElementById('betBtn1'),
            cashBtn1: document.getElementById('cashBtn1'),
            cancelBtn1: document.getElementById('cancelBtn1'),
            betAmount1: document.getElementById('betAmount1'),
            decreaseBtn: document.getElementById('decreaseBtn'),
            increaseBtn: document.getElementById('increaseBtn'),
            historyBtn: document.getElementById('historyBtn'),
            historyCount: document.getElementById('historyCount'),
            historyModal: document.getElementById('historyModal'),
            closeHistoryModal: document.getElementById('closeHistoryModal'),
            multipliersGrid: document.getElementById('multipliersGrid'),
            totalFlights: document.getElementById('totalFlights'),
            totalProfit: document.getElementById('totalProfit'),
            bestAltitude: document.getElementById('bestAltitude'),
            particles: document.getElementById('particles'),
            skyCanvas: document.querySelector('.sky-canvas'),
            // Ranking elements
            rankingList: document.getElementById('rankingList'),
            rankingModal: document.getElementById('rankingModal'),
            rankingModalList: document.getElementById('rankingModalList'),
            closeRankingModal: document.getElementById('closeRankingModal'),
            // Users list elements
            usersList: document.getElementById('usersList'),
            onlineCount: document.getElementById('onlineCount')
        };

        // Initialize game
        function initializeGame() {
            // Check authentication first
            if (!checkAuthentication()) {
                return;
            }
            
            createParticles();
            createSkyParticles();
            updateDisplay();
            attachEventHandlers();
            
            // El juego ahora se controla desde el servidor via Socket.IO
            console.log('🎮 Cliente listo - esperando eventos del servidor...');
        }

        // Create floating particles
        function createParticles() {
            for (let i = 0; i < 50; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.animationDelay = Math.random() * 15 + 's';
                particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
                refs.particles.appendChild(particle);
            }
        }

        // Create animated sky particles (stars)
        function createSkyParticles() {
            const skyTypes = ['small', 'medium', 'large'];
            for (let i = 0; i < 20; i++) {
                const particle = document.createElement('div');
                particle.className = `sky-particle ${skyTypes[Math.floor(Math.random() * skyTypes.length)]}`;
                particle.style.top = Math.random() * 80 + '%';
                particle.style.animationDelay = Math.random() * 25 + 's';
                particle.style.animationDuration = (Math.random() * 10 + 20) + 's';
                refs.skyCanvas.appendChild(particle);
            }
        }

        // Create rocket trail effect
        function createRocketTrail() {
            const rocketRect = refs.rocketShip.getBoundingClientRect();
            const skyRect = refs.skyCanvas.getBoundingClientRect();
            
            // Calculate relative position
            const relativeX = rocketRect.left - skyRect.left + (rocketRect.width / 2);
            const relativeY = rocketRect.top - skyRect.top + (rocketRect.height / 2);
            
            // Create trail particles
            const particleTypes = ['small', 'medium', 'large'];
            const numParticles = 3;
            
            for (let i = 0; i < numParticles; i++) {
                const particle = document.createElement('div');
                particle.className = `trail-particle ${particleTypes[Math.floor(Math.random() * particleTypes.length)]}`;
                
                // Position particles behind the rocket with some randomness
                const offsetX = Math.random() * 20 - 30; // Behind the rocket
                const offsetY = Math.random() * 16 - 8; // Some vertical spread
                
                particle.style.left = (relativeX + offsetX) + 'px';
                particle.style.top = (relativeY + offsetY) + 'px';
                
                refs.rocketTrail.appendChild(particle);
                
                // Remove particle after animation
                setTimeout(() => {
                    if (particle.parentNode) {
                        particle.parentNode.removeChild(particle);
                    }
                }, 1000);
            }
        }

        // Clear rocket trail
        function clearRocketTrail() {
            refs.rocketTrail.innerHTML = '';
        }

        // Bet Amount Controls
        function adjustBetAmount(direction) {
            if (gamePhase !== 'waiting') return;
            
            const currentAmount = parseFloat(refs.betAmount1.value);
            let newAmount;
            
            if (direction > 0) {
                // Increase
                if (currentAmount < 5) newAmount = currentAmount + 1;
                else if (currentAmount < 50) newAmount = currentAmount + 5;
                else newAmount = currentAmount + 10;
            } else {
                // Decrease
                if (currentAmount <= 5) newAmount = Math.max(1, currentAmount - 1);
                else if (currentAmount <= 50) newAmount = currentAmount - 5;
                else newAmount = currentAmount - 10;
            }
            
            setBetAmount(newAmount);
            updateQuickBetButtons();
        }

        function setBetAmount(amount) {
            if (gamePhase !== 'waiting') return;
            refs.betAmount1.value = amount;
        }

        function updateQuickBetButtons(activeBtn = null) {
            const quickBetBtns = document.querySelectorAll('.quick-bet-btn');
            const currentAmount = parseFloat(refs.betAmount1.value);
            
            quickBetBtns.forEach(btn => {
                btn.classList.remove('active');
                const btnAmount = parseFloat(btn.getAttribute('data-amount'));
                if (btnAmount === currentAmount) {
                    btn.classList.add('active');
                }
            });
            
            if (activeBtn) {
                activeBtn.classList.add('active');
            }
        }

        // History Modal Functions
        function openHistoryModal() {
            updateHistoryModal();
            refs.historyModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closeHistoryModal() {
            refs.historyModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        function getMultiplierCategory(multiplier) {
            if (multiplier < 2) return 'low';
            if (multiplier < 5) return 'medium';
            if (multiplier < 10) return 'high';
            return 'extreme';
        }

        function updateHistoryModal() {
            refs.multipliersGrid.innerHTML = '';
            
            if (flightHistory.length === 0) {
                refs.multipliersGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 20px; opacity: 0.6;">No hay rondas registradas aún</div>';
                return;
            }

            flightHistory.forEach((multiplier, index) => {
                const square = document.createElement('div');
                square.className = `multiplier-square ${getMultiplierCategory(multiplier)}`;
                square.textContent = multiplier.toFixed(2) + 'x';
                square.title = `Ronda ${gameStatistics.totalFlights - index}: ${multiplier.toFixed(2)}x`;
                refs.multipliersGrid.appendChild(square);
            });
        }

        // Ranking Functions
        function getAllUsers() {
            const users = JSON.parse(localStorage.getItem('skybet_users')) || [];
            return users.map(user => ({
                username: user.username,
                balance: user.balance || 1000,
                stats: user.stats || { totalFlights: 0, totalProfit: 0, bestAltitude: 0 }
            }));
        }

        function generateRanking() {
            const users = getAllUsers();
            
            // Sort by total profit (descending)
            users.sort((a, b) => b.stats.totalProfit - a.stats.totalProfit);
            
            return users.map((user, index) => ({
                position: index + 1,
                username: user.username,
                profit: user.stats.totalProfit,
                flights: user.stats.totalFlights,
                bestMultiplier: user.stats.bestAltitude,
                balance: user.balance
            }));
        }

        function updateRankingDisplay() {
            const ranking = generateRanking();
            refs.rankingList.innerHTML = '';
            
            if (ranking.length === 0) {
                refs.rankingList.innerHTML = '<div style="text-align: center; padding: 20px; opacity: 0.6;">No hay jugadores registrados</div>';
                return;
            }

            // Determine how many players to show based on screen size
            let maxPlayers = 8;
            if (window.innerWidth <= 480) {
                maxPlayers = 5; // Show fewer players on small screens
            } else if (window.innerWidth <= 768) {
                maxPlayers = 6;
            }
            
            // Show top players based on screen size
            const topPlayers = ranking.slice(0, maxPlayers);
            
            topPlayers.forEach((player, index) => {
                const entry = document.createElement('div');
                entry.className = 'ranking-entry';
                
                // Highlight current user
                if (currentUser && player.username === currentUser.username) {
                    entry.classList.add('current-user');
                }
                
                // Position styling
                let positionClass = 'others';
                let positionText = `#${player.position}`;
                
                if (player.position === 1) {
                    positionClass = 'top-1';
                    positionText = '👑 #1';
                } else if (player.position === 2) {
                    positionClass = 'top-2';
                    positionText = '🥈 #2';
                } else if (player.position === 3) {
                    positionClass = 'top-3';
                    positionText = '🥉 #3';
                }
                
                // Avatar emoji based on performance
                let avatar = '👤';
                if (player.profit > 1000) avatar = '🚀';
                else if (player.profit > 500) avatar = '⭐';
                else if (player.profit > 0) avatar = '🌟';
                else if (player.profit < -500) avatar = '💀';
                
                entry.innerHTML = `
                    <div class="ranking-position ${positionClass}">${positionText}</div>
                    <div class="ranking-avatar">${avatar}</div>
                    <div class="ranking-info">
                        <div class="ranking-username">${player.username}</div>
                        <div class="ranking-stats">
                            <span>🛸 ${player.flights}</span>
                            <span>🎯 ${player.bestMultiplier.toFixed(2)}x</span>
                        </div>
                    </div>
                    <div class="ranking-profit ${player.profit < 0 ? 'negative' : ''}">${player.profit >= 0 ? '+' : ''}$${player.profit.toFixed(2)}</div>
                `;
                
                refs.rankingList.appendChild(entry);
            });

            // If there are more players, show a summary
            if (ranking.length > maxPlayers) {
                const moreEntry = document.createElement('div');
                moreEntry.className = 'ranking-entry';
                moreEntry.style.opacity = '0.7';
                moreEntry.style.fontStyle = 'italic';
                moreEntry.innerHTML = `
                    <div class="ranking-position others">...</div>
                    <div class="ranking-avatar">📊</div>
                    <div class="ranking-info">
                        <div class="ranking-username">+${ranking.length - maxPlayers} más</div>
                    </div>
                `;
                refs.rankingList.appendChild(moreEntry);
            }
        }

        function openRankingModal() {
            updateRankingModal();
            refs.rankingModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function closeRankingModal() {
            refs.rankingModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        function updateRankingModal() {
            const ranking = generateRanking();
            refs.rankingModalList.innerHTML = '';
            
            if (ranking.length === 0) {
                refs.rankingModalList.innerHTML = '<div style="text-align: center; padding: 40px; opacity: 0.6;">No hay jugadores registrados</div>';
                return;
            }

            ranking.forEach((player, index) => {
                const entry = document.createElement('div');
                entry.className = 'ranking-entry';
                
                // Highlight current user
                if (currentUser && player.username === currentUser.username) {
                    entry.classList.add('current-user');
                }
                
                // Position styling
                let positionClass = 'others';
                let positionText = `#${player.position}`;
                
                if (player.position === 1) {
                    positionClass = 'top-1';
                    positionText = '👑 #1';
                } else if (player.position === 2) {
                    positionClass = 'top-2';
                    positionText = '🥈 #2';
                } else if (player.position === 3) {
                    positionClass = 'top-3';
                    positionText = '🥉 #3';
                }
                
                // Avatar emoji based on performance
                let avatar = '👤';
                if (player.profit > 1000) avatar = '🚀';
                else if (player.profit > 500) avatar = '⭐';
                else if (player.profit > 0) avatar = '🌟';
                else if (player.profit < -500) avatar = '💀';
                
                entry.innerHTML = `
                    <div class="ranking-position ${positionClass}">${positionText}</div>
                    <div class="ranking-avatar">${avatar}</div>
                    <div class="ranking-info">
                        <div class="ranking-username">${player.username}</div>
                        <div class="ranking-stats">
                            <span>🛸 ${player.flights} vuelos</span>
                            <span>🎯 ${player.bestMultiplier.toFixed(2)}x mejor</span>
                        </div>
                    </div>
                    <div class="ranking-profit ${player.profit < 0 ? 'negative' : ''}">${player.profit >= 0 ? '+' : ''}$${player.profit.toFixed(2)}</div>
                `;
                
                refs.rankingModalList.appendChild(entry);
            });
        }

        // Users List Functions
        function updateUsersList(users) {
            connectedUsers = users;
            refs.usersList.innerHTML = '';
            refs.onlineCount.textContent = `(${users.length})`;
            
            if (users.length === 0) {
                refs.usersList.innerHTML = '<div style="text-align: center; padding: 20px; opacity: 0.6;">No hay usuarios conectados</div>';
                return;
            }

            users.forEach((user, index) => {
                const userEntry = document.createElement('div');
                userEntry.className = 'user-entry';
                
                // Highlight current user
                if (currentUser && user.username === currentUser.username) {
                    userEntry.classList.add('current-user');
                }
                
                // User status indicators
                let statusIndicator = '🟢'; // Online
                let userAvatar = '👤';
                
                // Determine avatar based on user activity or status
                if (user.betting) {
                    statusIndicator = '🎯'; // Currently betting
                    userAvatar = '🚀';
                } else if (user.balance > 5000) {
                    userAvatar = '💎'; // High roller
                } else if (user.balance > 2000) {
                    userAvatar = '⭐'; // Medium player
                }
                
                userEntry.innerHTML = `
                    <div class="user-status">${statusIndicator}</div>
                    <div class="user-avatar">${userAvatar}</div>
                    <div class="user-info">
                        <div class="user-name">${user.username}</div>
                        <div class="user-balance">$${user.balance ? user.balance.toFixed(2) : '0.00'}</div>
                    </div>
                `;
                
                refs.usersList.appendChild(userEntry);
            });
        }

        // Event handlers
        function attachEventHandlers() {
            refs.betBtn1.addEventListener('click', () => executeBet());
            refs.cashBtn1.addEventListener('click', () => executeCashout());
            refs.cancelBtn1.addEventListener('click', () => executeCancelBet());
            
            // Amount control handlers
            refs.decreaseBtn.addEventListener('click', () => adjustBetAmount(-1));
            refs.increaseBtn.addEventListener('click', () => adjustBetAmount(1));
            
            // Quick bet handlers
            const quickBetBtns = document.querySelectorAll('.quick-bet-btn');
            quickBetBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const amount = parseFloat(btn.getAttribute('data-amount'));
                    setBetAmount(amount);
                    updateQuickBetButtons(btn);
                });
            });
            
            // History modal handlers
            refs.historyBtn.addEventListener('click', () => openHistoryModal());
            refs.closeHistoryModal.addEventListener('click', () => closeHistoryModal());
            refs.historyModal.addEventListener('click', (e) => {
                if (e.target === refs.historyModal) {
                    closeHistoryModal();
                }
            });
            
            // Logout button handler
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
                        if (typeof window.SkyBetAuth !== 'undefined') {
                            window.SkyBetAuth.logout();
                        } else {
                            window.location.href = 'login.html';
                        }
                    }
                });
            }
        }

        // Execute bet - Solo envía evento al servidor
        function executeBet() {
            if (gamePhase !== 'betting_open') {
                alert('⚠️ No se pueden colocar apuestas en este momento');
                return;
            }

            const betAmount = parseFloat(document.getElementById('betAmount1').value);
            
            if (betAmount <= 0) {
                alert('⚠️ Monto de apuesta inválido');
                return;
            }
            
            if (betAmount > playerBalance) {
                alert('⚠️ Balance insuficiente');
                return;
            }

            // Enviar apuesta al servidor - el servidor decidirá si es válida
            socket.emit('bet:place', {
                amount: betAmount,
                username: currentUser?.username || 'Piloto'
            });
            
            console.log('🎯 Enviando apuesta al servidor:', betAmount);
        }

        // Execute cashout - Solo envía evento al servidor
        function executeCashout() {
            if (gamePhase !== 'in_flight') {
                alert('⚠️ No se puede retirar en este momento');
                return;
            }
            
            if (!betActive) {
                alert('⚠️ No tienes ninguna apuesta activa');
                return;
            }

            // Enviar cashout al servidor - el servidor calculará las ganancias
            socket.emit('bet:cashout', {
                username: currentUser?.username || 'Piloto',
                multiplier: currentAltitude
            });
            
            console.log('💰 Enviando cashout al servidor en:', currentAltitude.toFixed(3) + 'x');
        }

        // Display win effect
        function displayWinEffect(amount) {
            const winElement = document.createElement('div');
            winElement.className = 'win-popup';
            winElement.textContent = `+$${amount.toFixed(2)}`;
            
            document.querySelector('.sky-canvas').appendChild(winElement);
            
            setTimeout(() => winElement.remove(), 2000);
        }

        // FUNCIONES DE UI - Solo para mostrar datos del servidor
        
        // Crear animación de explosión cuando el servidor envía crash
        function createCrashAnimation() {
            const rocketRect = refs.rocketShip.getBoundingClientRect();
            const skyRect = refs.skyCanvas.getBoundingClientRect();
            
            // Calculate relative position for explosion
            const relativeX = rocketRect.left - skyRect.left + (rocketRect.width / 2);
            const relativeY = rocketRect.top - skyRect.top + (rocketRect.height / 2);
            
            // 1. Rocket crash animation
            refs.rocketShip.classList.add('rocket-crash');
            
            // 2. Create explosion effect
            const explosion = document.createElement('div');
            explosion.className = 'explosion';
            explosion.style.left = (relativeX - 50) + 'px';
            explosion.style.top = (relativeY - 50) + 'px';
            refs.skyCanvas.appendChild(explosion);
            
            // 3. Create debris particles
            for (let i = 0; i < 15; i++) {
                const debris = document.createElement('div');
                debris.className = 'debris';
                
                // Random direction and distance for debris
                const angle = (Math.PI * 2 * i) / 15;
                const distance = 80 + Math.random() * 60;
                const debrisX = Math.cos(angle) * distance;
                const debrisY = Math.sin(angle) * distance;
                
                debris.style.left = relativeX + 'px';
                debris.style.top = relativeY + 'px';
                debris.style.setProperty('--debris-x', debrisX + 'px');
                debris.style.setProperty('--debris-y', debrisY + 'px');
                
                // Vary debris size and color
                const size = 3 + Math.random() * 4;
                debris.style.width = size + 'px';
                debris.style.height = size + 'px';
                
                const colors = ['#ff6b6b', '#ff4757', '#ff3742', '#ffa502', '#ff6348'];
                debris.style.background = colors[Math.floor(Math.random() * colors.length)];
                
                refs.skyCanvas.appendChild(debris);
                
                // Remove debris after animation
                setTimeout(() => {
                    if (debris.parentNode) {
                        debris.parentNode.removeChild(debris);
                    }
                }, 2000);
            }
            
            // 4. Screen shake effect
            document.body.classList.add('screen-shake');
            setTimeout(() => {
                document.body.classList.remove('screen-shake');
            }, 800);
            
            // 5. Flash effect
            const flash = document.createElement('div');
            flash.className = 'crash-flash';
            document.body.appendChild(flash);
            
            setTimeout(() => {
                if (flash.parentNode) {
                    flash.parentNode.removeChild(flash);
                }
            }, 600);
            
            // 6. Remove explosion after animation
            setTimeout(() => {
                if (explosion.parentNode) {
                    explosion.parentNode.removeChild(explosion);
                }
            }, 1200);
        }
        
        // Crear trail del cohete durante el vuelo
        function createRocketTrail() {
            const rocketRect = refs.rocketShip.getBoundingClientRect();
            const skyRect = refs.skyCanvas.getBoundingClientRect();
            
            // Calculate relative position
            const relativeX = rocketRect.left - skyRect.left + (rocketRect.width / 2);
            const relativeY = rocketRect.top - skyRect.top + (rocketRect.height / 2);
            
            // Create trail particles
            const particleTypes = ['small', 'medium', 'large'];
            const numParticles = 3;
            
            for (let i = 0; i < numParticles; i++) {
                const particle = document.createElement('div');
                particle.className = `trail-particle ${particleTypes[Math.floor(Math.random() * particleTypes.length)]}`;
                
                // Position particles behind the rocket with some randomness
                const offsetX = Math.random() * 20 - 30; // Behind the rocket
                const offsetY = Math.random() * 16 - 8; // Some vertical spread
                
                particle.style.left = (relativeX + offsetX) + 'px';
                particle.style.top = (relativeY + offsetY) + 'px';
                
                refs.rocketTrail.appendChild(particle);
                
                // Remove particle after animation
                setTimeout(() => {
                    if (particle.parentNode) {
                        particle.parentNode.removeChild(particle);
                    }
                }, 1000);
            }
        }

        // Limpiar trail del cohete
        function clearRocketTrail() {
            if (refs.rocketTrail) {
                refs.rocketTrail.innerHTML = '';
            }
        }

        // Mostrar efecto de ganancia
        function displayWinEffect(amount) {
            const winElement = document.createElement('div');
            winElement.className = 'win-popup';
            winElement.textContent = `+$${amount.toFixed(2)}`;
            
            document.querySelector('.sky-canvas').appendChild(winElement);
            
            setTimeout(() => winElement.remove(), 2000);
        }

        // Update display
        function updateDisplay() {
            refs.userBalance.textContent = playerBalance.toFixed(2);
            refs.totalFlights.textContent = gameStatistics.totalFlights;
            refs.totalProfit.textContent = '$' + gameStatistics.totalProfit.toFixed(2);
            refs.bestAltitude.textContent = gameStatistics.bestAltitude.toFixed(2) + 'x';
            refs.historyCount.textContent = flightHistory.length;
            
            // Update ranking display
            updateRankingDisplay();
            
            // Update users list with current data
            if (connectedUsers.length > 0) {
                updateUsersList(connectedUsers);
            }
            
            // Save progress after updating display
            saveUserProgress();
        }

        // Start the game
        initializeGame();