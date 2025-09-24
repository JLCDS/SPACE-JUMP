    // Game state variables
        let gamePhase = 'waiting'; // waiting, flying, crashed
        let currentAltitude = 1.00;
        let flightHistory = [];
        let playerBalance = 1000.00;
        let bet1Active = false;
        let bet2Active = false;
        let bet1Value = 0;
        let bet2Value = 0;
        let gameStatistics = {
            totalFlights: 0,
            totalProfit: 0,
            bestAltitude: 0
        };

        // DOM references
        const refs = {
            rocketShip: document.getElementById('rocketShip'),
            altitudeMultiplier: document.getElementById('altitudeMultiplier'),
            flightStatus: document.getElementById('flightStatus'),
            userBalance: document.getElementById('userBalance'),
            betBtn1: document.getElementById('betBtn1'),
            betBtn2: document.getElementById('betBtn2'),
            cashBtn1: document.getElementById('cashBtn1'),
            cashBtn2: document.getElementById('cashBtn2'),
            betAmount1: document.getElementById('betAmount1'),
            betAmount2: document.getElementById('betAmount2'),
            multiplier1: document.getElementById('multiplier1'),
            multiplier2: document.getElementById('multiplier2'),
            flightHistory: document.getElementById('flightHistory'),
            totalFlights: document.getElementById('totalFlights'),
            totalProfit: document.getElementById('totalProfit'),
            bestAltitude: document.getElementById('bestAltitude'),
            particles: document.getElementById('particles'),
            cloudsContainer: document.getElementById('cloudsContainer')
        };

        // Initialize game
        function initializeGame() {
            createParticles();
            createClouds();
            updateDisplay();
            attachEventHandlers();
            startGameLoop();
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

        // Create animated clouds
        function createClouds() {
            const cloudTypes = ['small', 'medium', 'large'];
            for (let i = 0; i < 8; i++) {
                const cloud = document.createElement('div');
                cloud.className = `cloud ${cloudTypes[Math.floor(Math.random() * cloudTypes.length)]}`;
                cloud.style.top = Math.random() * 70 + '%';
                cloud.style.animationDelay = Math.random() * 20 + 's';
                cloud.style.animationDuration = (Math.random() * 10 + 15) + 's';
                refs.cloudsContainer.appendChild(cloud);
            }
        }

        // Event handlers
        function attachEventHandlers() {
            refs.betBtn1.addEventListener('click', () => executeBet(1));
            refs.betBtn2.addEventListener('click', () => executeBet(2));
            refs.cashBtn1.addEventListener('click', () => executeCashout(1));
            refs.cashBtn2.addEventListener('click', () => executeCashout(2));
        }

        // Execute bet
        function executeBet(betSlot) {
            if (gamePhase !== 'waiting') return;

            const betAmount = parseFloat(document.getElementById(`betAmount${betSlot}`).value);
            
            if (betAmount <= 0 || betAmount > playerBalance) {
                alert('⚠️ Monto de apuesta inválido');
                return;
            }

            if (betSlot === 1) {
                bet1Active = true;
                bet1Value = betAmount;
                refs.betBtn1.style.display = 'none';
                refs.betAmount1.disabled = true;
            } else {
                bet2Active = true;
                bet2Value = betAmount;
                refs.betBtn2.style.display = 'none';
                refs.betAmount2.disabled = true;
            }

            playerBalance -= betAmount;
            updateDisplay();
        }

        // Execute cashout
        function executeCashout(betSlot) {
            if (gamePhase !== 'flying') return;

            let winnings = 0;
            
            if (betSlot === 1 && bet1Active) {
                winnings = bet1Value * currentAltitude;
                bet1Active = false;
                refs.cashBtn1.style.display = 'none';
                gameStatistics.totalProfit += winnings;
            } else if (betSlot === 2 && bet2Active) {
                winnings = bet2Value * currentAltitude;
                bet2Active = false;
                refs.cashBtn2.style.display = 'none';
                gameStatistics.totalProfit += winnings;
            }

            if (winnings > 0) {
                playerBalance += winnings;
                updateDisplay();
                displayWinEffect(winnings);
            }
        }

        // Display win effect
        function displayWinEffect(amount) {
            const winElement = document.createElement('div');
            winElement.className = 'win-popup';
            winElement.textContent = `+$${amount.toFixed(2)}`;
            
            document.querySelector('.sky-canvas').appendChild(winElement);
            
            setTimeout(() => winElement.remove(), 2000);
        }

        // Main game loop
        function startGameLoop() {
            setTimeout(() => {
                if (bet1Active || bet2Active) {
                    initiateFlight();
                } else {
                    prepareNextRound();
                }
            }, 4000);
        }

        // Initiate flight
        function initiateFlight() {
            gamePhase = 'flying';
            currentAltitude = 1.00;
            
            refs.flightStatus.innerHTML = '🟢 ¡Vuelo en progreso!';
            refs.flightStatus.className = 'status-active';
            
            // Show cashout buttons
            if (bet1Active) refs.cashBtn1.style.display = 'block';
            if (bet2Active) refs.cashBtn2.style.display = 'block';
            
            // Flight simulation
            const flightInterval = setInterval(() => {
                currentAltitude += 0.01;
                updateAltitude();
                animateRocket();
                
                // Crash probability calculation
                const crashProbability = Math.random();
                const baseCrashChance = 0.004;
                const altitudeFactor = (currentAltitude - 1) * 0.008;
                
                if (crashProbability < baseCrashChance + altitudeFactor) {
                    clearInterval(flightInterval);
                    executeCrash();
                }
                
                // Maximum altitude limit
                if (currentAltitude >= 50) {
                    clearInterval(flightInterval);
                    executeCrash();
                }
            }, 120);
        }

        // Update altitude display
        function updateAltitude() {
            refs.altitudeMultiplier.textContent = currentAltitude.toFixed(2) + 'x';
            refs.altitudeMultiplier.classList.remove('crashed-effect');
            
            // Update bet multipliers
            if (bet1Active) refs.multiplier1.textContent = currentAltitude.toFixed(2) + 'x';
            if (bet2Active) refs.multiplier2.textContent = currentAltitude.toFixed(2) + 'x';
        }

        // Animate rocket
        function animateRocket() {
            const progress = Math.min((currentAltitude - 1) * 15, 75);
            const verticalProgress = Math.min((currentAltitude - 1) * 10, 60);
            
            refs.rocketShip.style.left = progress + '%';
            refs.rocketShip.style.bottom = (15 + verticalProgress) + '%';
            refs.rocketShip.style.transform = `rotate(${progress * 0.4}deg) scale(${1 + progress * 0.005})`;
        }

        // Execute crash
        function executeCrash() {
            gamePhase = 'crashed';
            
            refs.flightStatus.innerHTML = '🔴 ¡Nave derribada!';
            refs.flightStatus.className = 'status-crashed';
            refs.altitudeMultiplier.classList.add('crashed-effect');
            
            // Hide cashout buttons
            refs.cashBtn1.style.display = 'none';
            refs.cashBtn2.style.display = 'none';
            
            // Process losses
            if (bet1Active) {
                gameStatistics.totalProfit -= bet1Value;
                bet1Active = false;
            }
            if (bet2Active) {
                gameStatistics.totalProfit -= bet2Value;
                bet2Active = false;
            }
            
            // Update statistics
            gameStatistics.totalFlights++;
            if (currentAltitude > gameStatistics.bestAltitude) {
                gameStatistics.bestAltitude = currentAltitude;
            }
            
            // Add to history
            flightHistory.unshift(currentAltitude);
            if (flightHistory.length > 8) flightHistory.pop();
            
            updateDisplay();
            updateFlightHistory();
            
            setTimeout(prepareNextRound, 4000);
        }

        // Prepare next round
        function prepareNextRound() {
            gamePhase = 'waiting';
            currentAltitude = 1.00;
            
            // Reset UI
            refs.flightStatus.innerHTML = '🟡 Preparando vuelo...';
            refs.flightStatus.className = 'status-idle';
            refs.altitudeMultiplier.textContent = '1.00x';
            refs.altitudeMultiplier.classList.remove('crashed-effect');
            refs.rocketShip.style.left = '5%';
            refs.rocketShip.style.bottom = '15%';
            refs.rocketShip.style.transform = 'rotate(0deg) scale(1)';
            
            // Reset multiplier displays
            refs.multiplier1.textContent = '1.00x';
            refs.multiplier2.textContent = '1.00x';
            
            // Enable controls
            refs.betBtn1.style.display = 'block';
            refs.betBtn2.style.display = 'block';
            refs.betAmount1.disabled = false;
            refs.betAmount2.disabled = false;
            
            startGameLoop();
        }

        // Update display
        function updateDisplay() {
            refs.userBalance.textContent = playerBalance.toFixed(2);
            refs.totalFlights.textContent = gameStatistics.totalFlights;
            refs.totalProfit.textContent = '$' + gameStatistics.totalProfit.toFixed(2);
            refs.bestAltitude.textContent = gameStatistics.bestAltitude.toFixed(2) + 'x';
        }

        // Update flight history
        function updateFlightHistory() {
            refs.flightHistory.innerHTML = '';
            flightHistory.forEach((altitude, index) => {
                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = `
                    <span class="round-number">Vuelo #${gameStatistics.totalFlights - index}</span>
                    <span class="round-multiplier ${altitude >= 2 ? 'multiplier-win' : 'multiplier-loss'}">${altitude.toFixed(2)}x</span>
                `;
                refs.flightHistory.appendChild(item);
            });
        }

        // Start the game
        initializeGame();