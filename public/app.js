import { firebaseConfig, appId } from '../firebaseConfig.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, onSnapshot, query, serverTimestamp, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- App Initialization ---
let app, auth, db, storage;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
} catch (e) {
    console.error("Firebase initialization failed:", e);
    document.getElementById('loading-spinner').innerHTML = '<p class="text-red-500">Erro ao conectar com a base de dados. Tente recarregar.</p>';
}

// --- DOM Elements ---
const loadingSpinner = document.getElementById('loading-spinner');
const mainContent = document.getElementById('main-content');
const nicknameModal = document.getElementById('nickname-modal');
const nicknameInput = document.getElementById('nickname-input');
const photoUrlInput = document.getElementById('photo-url-input');
const saveNicknameBtn = document.getElementById('save-nickname-btn');
const nicknameError = document.getElementById('nickname-error');
const addCatchBtn = document.getElementById('add-catch-btn');
const addCatchModal = document.getElementById('add-catch-modal');
const closeCatchModalBtn = document.getElementById('close-catch-modal');
const catchForm = document.getElementById('catch-form');
const catchError = document.getElementById('catch-error');
const fishPhotoInput = document.getElementById('fish-photo-input');
const fileNameDisplay = document.getElementById('file-name');
const submitCatchBtn = document.getElementById('submit-catch-btn');
const rankingList = document.getElementById('ranking-list');
const feedContainer = document.getElementById('feed-container');

let currentUser = { uid: null, nickname: null, photoURL: null };
let unsubscribeCatches = null;

// --- Main App Logic ---
async function startApp() {
    try {
        const userCredential = await signInAnonymously(auth);
        currentUser.uid = userCredential.user.uid;
        setupListeners();
    } catch (error) {
        console.error("Anonymous sign-in failed:", error);
        loadingSpinner.innerHTML = '<p class="text-red-500">Não foi possível iniciar. Tente recarregar a página.</p>';
    }
}

// --- Event Listeners ---
addCatchBtn.addEventListener('click', () => {
    if (!currentUser.nickname) {
        nicknameModal.style.display = 'flex';
    } else {
        addCatchModal.style.display = 'flex';
    }
});

saveNicknameBtn.addEventListener('click', () => {
    nicknameError.textContent = '';
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
        nicknameError.textContent = 'O nome de guerra é obrigatório!';
        return;
    }
    currentUser.nickname = nickname;
    currentUser.photoURL = photoUrlInput.value.trim() || `https://placehold.co/100x100/3B82F6/FFFFFF?text=${nickname.charAt(0).toUpperCase()}`;
    nicknameModal.style.display = 'none';
    addCatchModal.style.display = 'flex';
});

fishPhotoInput.addEventListener('change', () => {
    if (fishPhotoInput.files.length > 0) {
        fileNameDisplay.textContent = fishPhotoInput.files[0].name;
    } else {
        fileNameDisplay.textContent = '';
    }
});

closeCatchModalBtn.addEventListener('click', () => {
    addCatchModal.style.display = 'none';
    catchForm.reset();
    fileNameDisplay.textContent = '';
    catchError.textContent = '';
});

catchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    catchError.textContent = '';
    submitCatchBtn.disabled = true;
    submitCatchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    const species = e.target.elements.species.value.trim();
    const weight = parseFloat(e.target.elements.weight.value);
    const photoFile = e.target.elements.photo.files[0];
    if (!species || !weight) {
        catchError.textContent = 'Espécie e peso são obrigatórios!';
        submitCatchBtn.disabled = false;
        submitCatchBtn.innerHTML = 'Salvar Captura';
        return;
    }
    if (weight <= 0) {
        catchError.textContent = 'O peso deve ser maior que zero!';
        submitCatchBtn.disabled = false;
        submitCatchBtn.innerHTML = 'Salvar Captura';
        return;
    }
    try {
        let photoURL = '';
        if (photoFile) {
            // 1. Upload image to Firebase Storage
            const filePath = `catches/${currentUser.uid}/${Date.now()}-${photoFile.name}`;
            const storageRef = ref(storage, filePath);
            const snapshot = await uploadBytes(storageRef, photoFile);
            photoURL = await getDownloadURL(snapshot.ref);
        }
        // 2. Add catch data to Firestore
        await addDoc(collection(db, `artifacts/${appId}/public/data/catches`), {
            userId: currentUser.uid,
            userNickname: currentUser.nickname,
            userPhotoURL: currentUser.photoURL,
            species: species,
            weight: weight,
            photoURL: photoURL,
            timestamp: serverTimestamp(),
            likes: [],
            comments: []
        });
        addCatchModal.style.display = 'none';
        catchForm.reset();
        fileNameDisplay.textContent = '';
    } catch (error) {
         console.error("Error adding catch:", error);
         catchError.textContent = "Erro ao registrar a captura. Tente de novo.";
    } finally {
        submitCatchBtn.disabled = false;
        submitCatchBtn.innerHTML = 'Salvar Captura';
    }
});

// --- Real-time Data Listeners ---
function setupListeners() {
    const catchesQuery = query(collection(db, `artifacts/${appId}/public/data/catches`));
    unsubscribeCatches = onSnapshot(catchesQuery, (snapshot) => {
        loadingSpinner.style.display = 'none';
        mainContent.classList.remove('invisible');
        const allCatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allCatches.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
        updateUI(allCatches);
    }, error => {
        console.error("Error listening to catches:", error)
        loadingSpinner.innerHTML = '<p class="text-red-500">Erro ao carregar os dados.</p>';
    });
}

// --- UI Update Logic ---
function updateUI(catches) {
    updateRanking(catches);
    updateFeed(catches);
}

function calculatePoints(catchData, userStats) {
    // Fatores por espécie
    const speciesFactors = {
        'Tilápia': 0.5,
        'Tambaqui': 3,
        'Pirarara': 3,
        'Dourado': 2.5,
        'Traíra': 1.5
    };
    const factor = speciesFactors[catchData.species] || 1;
    let basePoints = (catchData.weight * factor);
    // Bônus de evento
    if (userStats && userStats.participatedEvent) basePoints *= 2;
    return basePoints;
}

function getComboBonus(catches) {
    // +10% se registrar 3 pescarias em 24h
    if (catches.length < 3) return 1;
    // Ordena por data
    const sorted = catches.map(c => new Date(c.timestamp)).sort((a, b) => a - b);
    for (let i = 0; i < sorted.length - 2; i++) {
        const t1 = sorted[i];
        const t2 = sorted[i + 2];
        if ((t2 - t1) / (1000 * 60 * 60) <= 24) return 1.1;
    }
    return 1;
}

function getInactivityPenalty(catches) {
    // -100 pontos se ficar 15 dias sem registrar pescarias
    if (catches.length === 0) return 0;
    const sorted = catches.map(c => new Date(c.timestamp)).sort((a, b) => a - b);
    let penalty = 0;
    for (let i = 1; i < sorted.length; i++) {
        const diffDays = (sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24);
        if (diffDays >= 15) penalty -= 100;
    }
    // Também penaliza se o último registro for há mais de 15 dias
    const now = new Date();
    const last = sorted[sorted.length - 1];
    if ((now - last) / (1000 * 60 * 60 * 24) >= 15) penalty -= 100;
    return penalty;
}

function updateRanking(catches) {
    const statsMap = {};
    catches.forEach(c => {
        if (!statsMap[c.userId]) {
            statsMap[c.userId] = {
                uid: c.userId, nickname: c.userNickname, photoURL: c.userPhotoURL,
                totalWeight: 0, catchCount: 0, totalPoints: 0, catches: [],
                top1Streak: 0, lastStreak: 0, wasLastOnce: false, participatedEvent: false, rankTitle: ''
            };
        }
        statsMap[c.userId].totalWeight += c.weight;
        statsMap[c.userId].catchCount++;
        statsMap[c.userId].catches.push(c);
    });
    // Cálculo de pontos com bônus e penalidades
    let rankedUsers = Object.values(statsMap);
    rankedUsers.forEach(user => {
        let points = 0;
        user.catches.forEach(c => {
            points += calculatePoints(c, user);
        });
        points *= getComboBonus(user.catches);
        points += getInactivityPenalty(user.catches);
        user.totalPoints = points;
        // Determinar títulos de ranking
        if (user.totalPoints >= 7000) user.rankTitle = 'Pescador FODA 🐟';
        else if (user.totalPoints >= 4000) user.rankTitle = 'Caçador de Monstros';
        else if (user.totalPoints >= 2000) user.rankTitle = 'Rei do Rio';
        else if (user.totalPoints >= 1000) user.rankTitle = 'Pescador Profissa';
        else if (user.totalPoints >= 500) user.rankTitle = 'Pescador Constante';
        else if (user.totalPoints >= 100) user.rankTitle = 'Pescador Iniciante';
        else user.rankTitle = 'Pesca Fofo 🧸';
    });
    // Seleção de modo de ranking
    const mode = document.getElementById('ranking-mode')?.value || 'weight';
    if (mode === 'weight') rankedUsers.sort((a, b) => b.totalWeight - a.totalWeight);
    else if (mode === 'count') rankedUsers.sort((a, b) => b.catchCount - a.catchCount);
    else if (mode === 'points') rankedUsers.sort((a, b) => b.totalPoints - a.totalPoints);
    rankingList.innerHTML = '';
    if (rankedUsers.length === 0) {
        rankingList.innerHTML = `<p class="text-gray-500 text-center">Ninguém pescou nada ainda. Seja o primeiro!</p>`;
        return;
    }
    rankedUsers.forEach((user, index) => {
        const rank = index + 1;
        let rankIcon = `<span class="font-bold text-gray-500 w-8 text-center">${rank}.</span>`;
        // Insígnias reais do usuário
        const badges = getUserBadges(user);
        const badgesHTML = badges.map(b => `<span title="${b.name} (${b.rarity}) - ${b.desc}\" class="text-xl mx-1">${b.icon}</span>`).join('');
        const userElement = document.createElement('div');
        userElement.className = `p-3 rounded-lg flex items-center space-x-3 transition-all ${rank === 1 ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-gray-100'}`;
        userElement.innerHTML = `
            ${rankIcon}
            <img src="${user.photoURL}" alt="${user.nickname}" class="w-12 h-12 rounded-full object-cover border-2 border-gray-300">
            <div class="flex-grow">
                <p class="font-bold text-gray-800">${user.nickname}</p>
                <p class="text-sm text-gray-600">
                    ${mode === 'weight' ? user.totalWeight.toFixed(2) + ' kg' : mode === 'count' ? user.catchCount + ' peixes' : user.totalPoints.toFixed(0) + ' pontos'}
                </p>
                <div class="mt-1">${badgesHTML}</div>
                <div class="text-xs font-bold text-blue-700 mt-1">${user.rankTitle}</div>
            </div>`;
        rankingList.appendChild(userElement);
    });
    // Salvar rankedUsers globalmente para uso no modal
    window._lastRankedUsers = rankedUsers;
    addProfileModalEvents();
}

function updateFeed(catches) {
    feedContainer.innerHTML = '';
    if (catches.length === 0) {
        feedContainer.innerHTML = `<div class="bg-white rounded-xl shadow-lg p-8 text-center">
                <i class="fas fa-water fa-3x text-blue-300 mb-4"></i>
                <h3 class="text-xl font-bold text-gray-700">O lago está calmo...</h3>
                <p class="text-gray-500">Nenhuma captura registrada ainda. Hora de molhar a linha!</p>
            </div>`;
        return;
    }
    catches.forEach(c => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-xl shadow-lg overflow-hidden';
        const timeAgo = c.timestamp ? formatTimeAgo(c.timestamp.toDate()) : 'agora mesmo';
        let commentsHTML = '';
        if (c.comments && c.comments.length > 0) {
            commentsHTML = c.comments.map(comment => `
                <div class="text-sm mt-2">
                    <span class="font-bold">${comment.nickname || 'Anônimo'}:</span>
                    <span>${comment.text}</span>
                </div>
            `).join('');
        }
        card.innerHTML = `
            <div class="p-4 flex items-center space-x-3 border-b border-gray-200">
                <img src="${c.userPhotoURL}" alt="${c.userNickname}" class="w-12 h-12 rounded-full object-cover">
                <div>
                    <p class="font-bold text-gray-800">${c.userNickname}</p>
                    <p class="text-sm text-gray-500">${timeAgo}</p>
                </div>
            </div>
            <img src="${c.photoURL || 'https://placehold.co/600x400/CCCCCC/FFFFFF?text=Sem+Foto'}" alt="Peixe pescado: ${c.species}" class="w-full h-auto object-cover max-h-[600px]" onerror="this.onerror=null;this.src='https://placehold.co/600x400/CCCCCC/FFFFFF?text=Imagem+Inválida';">
            <div class="p-4">
                <p class="text-lg font-semibold"><span class="font-bold">${c.species}</span> de <span class="font-bold">${c.weight.toFixed(2)} kg</span></p>
                <div class="flex items-center mt-3 text-gray-600">
                    <button data-catch-id="${c.id}" class="like-btn text-xl hover:text-red-500 transition-colors ${c.likes.includes(currentUser.uid) ? 'text-red-500' : ''}">
                        <i class="fas fa-heart"></i>
                    </button>
                    <span class="ml-2 text-lg">${c.likes.length}</span>
                </div>
                <div class="mt-4">
                    <div class="comments-section max-h-40 overflow-y-auto comment-scrollbar pr-2">${commentsHTML}</div>
                    <form class="comment-form mt-3 flex gap-2" data-catch-id="${c.id}">
                        <input type="text" class="w-full border-2 border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:border-blue-400" placeholder="Adicione um comentário..." required>
                        <button type="submit" class="bg-blue-500 text-white font-bold px-4 py-2 rounded-lg hover:bg-blue-600"><i class="fas fa-paper-plane"></i></button>
                    </form>
                </div>
            </div>`;
        feedContainer.appendChild(card);
    });
    document.querySelectorAll('.like-btn').forEach(btn => btn.addEventListener('click', handleLikeClick));
    document.querySelectorAll('.comment-form').forEach(form => form.addEventListener('submit', handleCommentSubmit));
}

async function handleLikeClick(e) {
    if(!currentUser.nickname) { alert("Você precisa de um nome de guerra para curtir!"); return; }
    const button = e.currentTarget;
    const catchId = button.dataset.catchId;
    const catchDocRef = doc(db, `artifacts/${appId}/public/data/catches`, catchId);
    const catchDoc = await getDoc(catchDocRef);
    if (catchDoc.exists()) {
        const catchData = catchDoc.data();
        const likes = catchData.likes || [];
        const newLikes = likes.includes(currentUser.uid)
            ? likes.filter(uid => uid !== currentUser.uid)
            : [...likes, currentUser.uid];
        await updateDoc(catchDocRef, { likes: newLikes });
    }
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    if (!currentUser.nickname) {
        nicknameModal.style.display = 'flex';
        return;
    }
    const form = e.currentTarget;
    const input = form.querySelector('input');
    const catchId = form.dataset.catchId;
    const commentText = input.value.trim();
    if (!commentText) return;
    const comment = {
        userId: currentUser.uid,
        nickname: currentUser.nickname,
        text: commentText,
        timestamp: new Date().toISOString()
    };
    const catchDocRef = doc(db, `artifacts/${appId}/public/data/catches`, catchId);
    try {
        await updateDoc(catchDocRef, {
            comments: arrayUnion(comment)
        });
        form.reset();
    } catch (error) {
        console.error("Error adding comment: ", error);
        alert("Não foi possível adicionar o comentário.");
    }
}

// --- Utility Functions ---
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " anos atrás";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " meses atrás";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " dias atrás";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " horas atrás";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutos atrás";
    return "agora mesmo";
}

document.getElementById('ranking-mode')?.addEventListener('change', () => {
    setupListeners(); // Atualiza o ranking ao trocar o modo
});

// --- Start the app ---
window.onload = startApp;

// Função para exibir o modal de perfil
function showProfileModal(user) {
  const modal = document.getElementById('profile-modal');
  const infoDiv = document.getElementById('profile-info');
  const badgesDiv = document.getElementById('profile-badges');
  infoDiv.innerHTML = `
    <div class="flex items-center gap-4 mb-4">
      <img src="${user.photoURL}" alt="${user.nickname}" class="w-16 h-16 rounded-full object-cover border-2 border-gray-300">
      <div>
        <p class="font-bold text-2xl text-gray-800 mb-1">${user.nickname}</p>
        <p class="text-sm text-blue-700 font-bold">${user.rankTitle}</p>
        <p class="text-sm text-gray-600">${user.totalWeight.toFixed(2)} kg | ${user.catchCount} peixes | ${user.totalPoints.toFixed(0)} pontos</p>
      </div>
    </div>
  `;
  // Insígnias conquistadas
  const conquered = getUserBadges(user).map(b => b.name);
  badgesDiv.innerHTML = BADGES.map(b => `
    <div class="flex flex-col items-center justify-center w-20">
      <span class="text-3xl ${conquered.includes(b.name) ? '' : 'opacity-30'}" title="${b.name} (${b.rarity}) - ${b.desc}">${b.icon}</span>
      <span class="text-xs text-center mt-1 ${conquered.includes(b.name) ? 'text-gray-800' : 'text-gray-400'}">${b.name}</span>
      <span class="text-[10px] ${conquered.includes(b.name) ? 'text-blue-600' : 'text-gray-300'}">${b.rarity}</span>
    </div>
  `).join('');
  modal.style.display = 'flex';
}
// Fechar modal
const closeProfileModalBtn = document.getElementById('close-profile-modal');
if (closeProfileModalBtn) {
  closeProfileModalBtn.onclick = () => {
    document.getElementById('profile-modal').style.display = 'none';
  };
}
// Adicionar evento ao nome do pescador no ranking
function addProfileModalEvents() {
  document.querySelectorAll('#ranking-list .font-bold.text-gray-800').forEach((el, idx) => {
    el.style.cursor = 'pointer';
    el.onclick = () => {
      // Pega o usuário correspondente
      const users = Array.from(document.querySelectorAll('#ranking-list .font-bold.text-gray-800'));
      const userIdx = users.indexOf(el);
      const rankedUsers = Array.from(document.querySelectorAll('#ranking-list .font-bold.text-gray-800')).map((e, i) => window._lastRankedUsers[i]);
      showProfileModal(window._lastRankedUsers[userIdx]);
    };
  });
}

// Modal de explicação do sistema de pontos
const openPointsInfoBtn = document.getElementById('open-points-info');
const pointsInfoModal = document.getElementById('points-info-modal');
const closePointsInfoModalBtn = document.getElementById('close-points-info-modal');
if (openPointsInfoBtn && pointsInfoModal && closePointsInfoModalBtn) {
  openPointsInfoBtn.onclick = () => { pointsInfoModal.style.display = 'flex'; };
  closePointsInfoModalBtn.onclick = () => { pointsInfoModal.style.display = 'none'; };
  pointsInfoModal.onclick = (e) => { if (e.target === pointsInfoModal) pointsInfoModal.style.display = 'none'; };
} 