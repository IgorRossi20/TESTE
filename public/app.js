import { firebaseConfig, appId } from '../firebaseConfig.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, onSnapshot, query, serverTimestamp, updateDoc, arrayUnion, setDoc, doc as firestoreDoc, getDocs, writeBatch, where, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

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
const logoutBtn = document.getElementById('logout-btn');

let currentUser = { uid: null, nickname: null, photoURL: null, email: null };
let unsubscribeCatches = null;

// --- NOVA LÓGICA DE AUTENTICAÇÃO COM TELAS SEPARADAS ---
const authModal = document.getElementById('auth-modal');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const registerForm = document.getElementById('register-form');
const registerEmail = document.getElementById('register-email');
const registerPassword = document.getElementById('register-password');
const registerNickname = document.getElementById('register-nickname');
const registerPhotoUrl = document.getElementById('register-photo-url');
const registerError = document.getElementById('register-error');
const showLoginBtn = document.getElementById('show-login');
const showRegisterBtn = document.getElementById('show-register');
const toRegisterLink = document.getElementById('to-register');
const toLoginLink = document.getElementById('to-login');

// --- SUPABASE STORAGE INTEGRAÇÃO ---
const SUPABASE_URL = 'https://swpmqihrmqxeriwmfein.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cG1xaWhybXF4ZXJpd21mZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MDcwMjcsImV4cCI6MjA2NzA4MzAyN30.6s75ykNzZIM9-ZWu6ySAIwZ6jRntRfnsIx5XC0865Pc';
const SUPABASE_BUCKET = 'capturas';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function showAuthModal() {
  authModal.style.display = 'flex';
}
function hideAuthModal() {
  authModal.style.display = 'none';
}
function showLogoutBtn() {
  logoutBtn.classList.remove('hidden');
}
function hideLogoutBtn() {
  logoutBtn.classList.add('hidden');
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Usuário logado
    currentUser.uid = user.uid;
    currentUser.email = user.email;
    // Buscar apelido do Firestore
    const userDoc = await getDoc(firestoreDoc(db, 'users', user.uid));
    if (userDoc.exists()) {
      currentUser.nickname = userDoc.data().nickname;
      currentUser.photoURL = userDoc.data().photoURL || `https://placehold.co/100x100/3B82F6/FFFFFF?text=${userDoc.data().nickname.charAt(0).toUpperCase()}`;
    } else {
      currentUser.nickname = '';
      currentUser.photoURL = '';
    }
    hideAuthModal();
    showLogoutBtn();
    setupListeners();
    mainContent.classList.remove('invisible');
  } else {
    currentUser = { uid: null, nickname: null, photoURL: null, email: null };
    showAuthModal();
    hideLogoutBtn();
    loadingSpinner.style.display = 'none';
    mainContent.classList.add('invisible');
  }
});

function showLoginForm() {
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  showLoginBtn.classList.add('text-blue-700', 'border-b-2', 'border-blue-700');
  showLoginBtn.classList.remove('text-gray-400');
  showRegisterBtn.classList.remove('text-blue-700', 'border-b-2', 'border-blue-700');
  showRegisterBtn.classList.add('text-gray-400');
}
function showRegisterForm() {
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  showRegisterBtn.classList.add('text-blue-700', 'border-b-2', 'border-blue-700');
  showRegisterBtn.classList.remove('text-gray-400');
  showLoginBtn.classList.remove('text-blue-700', 'border-b-2', 'border-blue-700');
  showLoginBtn.classList.add('text-gray-400');
}
showLoginBtn.addEventListener('click', showLoginForm);
showRegisterBtn.addEventListener('click', showRegisterForm);
toRegisterLink.addEventListener('click', (e) => { e.preventDefault(); showRegisterForm(); });
toLoginLink.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });

// --- Lógica de seleção de avatar no cadastro ---
const avatarOptions = document.querySelectorAll('.avatar-option');
const registerAvatar = document.getElementById('register-avatar');
const avatarError = document.getElementById('avatar-error');
avatarOptions.forEach(option => {
  option.addEventListener('click', () => {
    avatarOptions.forEach(o => o.classList.remove('border-blue-500'));
    option.classList.add('border-blue-500');
    registerAvatar.value = option.getAttribute('data-avatar');
    avatarError.textContent = '';
  });
});

// Adicionar link de esqueci a senha no login
const forgotPasswordLink = document.getElementById('forgot-password');

if (forgotPasswordLink) {
  forgotPasswordLink.addEventListener('click', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const email = loginEmail.value.trim();
    if (!email) {
      loginError.textContent = 'Digite seu e-mail para redefinir a senha.';
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      loginError.textContent = 'E-mail de redefinição enviado! Verifique sua caixa de entrada.';
      loginError.style.color = 'green';
    } catch (err) {
      loginError.textContent = 'Erro ao enviar e-mail de redefinição. Verifique o e-mail digitado.';
      loginError.style.color = '';
    }
  });
}

// --- Cadastro: preview e upload de foto de perfil ---
const registerPhotoInput = document.getElementById('register-photo-input');
const registerPhotoName = document.getElementById('register-photo-name');
const registerPhotoPreview = document.getElementById('register-photo-preview');
registerPhotoInput.addEventListener('change', () => {
  if (registerPhotoInput.files.length > 0) {
    registerPhotoName.textContent = registerPhotoInput.files[0].name;
    const reader = new FileReader();
    reader.onload = e => {
      registerPhotoPreview.src = e.target.result;
      registerPhotoPreview.classList.remove('hidden');
    };
    reader.readAsDataURL(registerPhotoInput.files[0]);
  } else {
    registerPhotoName.textContent = '';
    registerPhotoPreview.src = '';
    registerPhotoPreview.classList.add('hidden');
  }
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';
  avatarError.textContent = '';
  const email = registerEmail.value.trim();
  const password = registerPassword.value;
  const nickname = registerNickname.value.trim();
  const photoURL = registerAvatar.value;
  if (!email || !password || !nickname) {
    registerError.textContent = 'Preencha todos os campos obrigatórios!';
    return;
  }
  if (!photoURL) {
    avatarError.textContent = 'Escolha um avatar!';
    return;
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const file = registerPhotoInput.files[0];
    console.log('Arquivo:', file);
    console.log('Tipo:', typeof file);
    console.log('Nome:', file.name);
    let photoURL = '';
    if (file) {
      console.log('Usuário autenticado:', supabase.auth.getUser());
      photoURL = await uploadToSupabase(file, Date.now()); // usar timestamp já que userId ainda não existe
    } else {
      photoURL = registerAvatar.value;
    }
    await setDoc(firestoreDoc(db, 'users', userCredential.user.uid), {
      nickname,
      photoURL,
      email
    });
    registerForm.reset();
    avatarOptions.forEach(o => o.classList.remove('border-blue-500'));
    hideAuthModal();
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      registerError.textContent = 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.';
    } else {
      registerError.textContent = 'Erro: ' + (err.message || 'Não foi possível cadastrar.');
    }
  }
});

logoutBtn?.addEventListener('click', async () => {
  await signOut(auth);
});

// --- Main App Logic ---
async function startApp() {
    try {
        // A lógica de autenticação agora é controlada pelo onAuthStateChanged
        // Não precisa fazer nada aqui
    } catch (error) {
        console.error("App initialization failed:", error);
        loadingSpinner.innerHTML = '<p class="text-red-500">Não foi possível iniciar. Tente recarregar a página.</p>';
    }
}

// --- Event Listeners ---
addCatchBtn.addEventListener('click', () => {
    // Se não tem nickname, mostra modal de auth
    if (!currentUser.nickname) {
        showAuthModal();
    } else {
        addCatchModal.style.display = 'flex';
    }
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
    const file = e.target.elements.photo.files[0];
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
        if (file) {
            // Upload para Supabase Storage
            console.log('Usuário autenticado:', supabase.auth.getUser());
            photoURL = await uploadToSupabase(file, currentUser.uid);
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
    } catch (err) {
        console.error("Erro detalhado:", err);
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
    updateKingOfMonth(catches);
    updateRanking(catches);
    updateFeed(catches);
}

function calculatePoints(catchData) {
    const speciesFactors = {
        'Barbado': 3,
        'Dourado': 2.5,
        'Matrinxã': 2,
        'Pacu': 2,
        'Pirarara': 3,
        'Pirarucu': 4,
        'Pintado': 3,
        'Tambacu': 3,
        'Tambaqui': 3,
        'Tilapia': 0.5,
        'Tucunaré': 4
    };
    const factor = speciesFactors[catchData.species] || 1;
    return catchData.weight * factor;
}

function getUserBadges(userStats) {
    // Retorna um array vazio se não quiser mostrar insígnias por enquanto
    return [];
}

function showKingOfMonth(user, points) {
  const kingOfMonthDiv = document.getElementById('king-of-month');
  const kingPhoto = document.getElementById('king-photo');
  const kingName = document.getElementById('king-name');
  const kingPoints = document.getElementById('king-points');

  if (!user) {
    kingOfMonthDiv.style.display = 'none';
    return;
  }
  kingPhoto.src = user.photoURL || '';
  kingName.textContent = user.nickname || '';
  kingPoints.textContent = `${points.toFixed(0)} pontos no mês`;
  kingOfMonthDiv.style.display = '';
}

function updateKingOfMonth(catches) {
  // Filtrar capturas do mês atual
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const monthCatches = catches.filter(c => {
    if (!c.timestamp || !c.timestamp.toDate) return false;
    const d = c.timestamp.toDate();
    return d.getMonth() === month && d.getFullYear() === year;
  });
  // Somar pontos por usuário
  const stats = {};
  monthCatches.forEach(c => {
    if (!stats[c.userId]) stats[c.userId] = { points: 0, user: { nickname: c.userNickname, photoURL: c.userPhotoURL } };
    stats[c.userId].points += calculatePoints(c);
  });
  // Encontrar o maior
  let king = null;
  let maxPoints = 0;
  Object.entries(stats).forEach(([uid, data]) => {
    if (data.points > maxPoints) {
      king = data.user;
      maxPoints = data.points;
    }
  });
  showKingOfMonth(king, maxPoints);
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
    let rankedUsers = Object.values(statsMap);
    rankedUsers.forEach(user => {
        let points = 0;
        user.catches.forEach(c => {
            points += calculatePoints(c);
        });
        user.totalPoints = points;
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
        let title = '';
        let nameClass = '';
        if (rank === 1) {
            title = 'Rei do Lago';
            nameClass = 'text-yellow-600 font-extrabold';
            rankIcon = `<i class="fas fa-crown crown-gold fa-lg w-8 text-center"></i>`;
        } else if (rank === rankedUsers.length) {
            title = 'Pesca Fofo';
            nameClass = 'text-pink-600 font-bold';
            rankIcon = `<i class="fas fa-poo text-amber-800 w-8 text-center"></i>`;
        } else if (rank === 2) {
            title = 'Veterano';
            nameClass = 'text-blue-700 font-bold';
            rankIcon = `<i class="fas fa-fish w-8 text-center"></i>`;
        } else if (rank === 3) {
            title = 'Desafiante';
            nameClass = 'text-green-700 font-bold';
            rankIcon = `<i class="fas fa-medal w-8 text-center"></i>`;
        } else {
            title = 'Aspirante';
            nameClass = 'text-gray-700';
        }
        const badges = getUserBadges(user);
        const badgesHTML = badges.map(b => `<span title="${b.name} (${b.rarity}) - ${b.desc}" class="text-xl mx-1">${b.icon}</span>`).join('');
        const userElement = document.createElement('div');
        userElement.className = `p-3 rounded-lg flex items-center space-x-3 transition-all ${rank === 1 ? 'bg-yellow-100 border-2 border-yellow-400' : rank === rankedUsers.length ? 'bg-pink-100 border-2 border-pink-300' : 'bg-gray-100'}`;
        userElement.innerHTML = `
            ${rankIcon}
            <img src="${user.photoURL}" alt="${user.nickname}" class="w-12 h-12 rounded-full object-cover border-2 border-gray-300">
            <div class="flex-grow">
                <p class="font-bold ${nameClass}">${user.nickname}</p>
                <p class="text-sm text-gray-600">
                    ${mode === 'weight' ? user.totalWeight.toFixed(2) + ' kg' : mode === 'count' ? user.catchCount + ' peixes' : user.totalPoints.toFixed(0) + ' pontos'}
                </p>
                <div class="mt-1">${badgesHTML}</div>
                <div class="text-xs font-bold mt-1">${title}</div>
            </div>`;
        rankingList.appendChild(userElement);
    });
    window._lastRankedUsers = rankedUsers;
    addProfileModalEvents();
}

function isAdmin() {
  // Substitua pelo seu e-mail de admin
  return currentUser.email === 'igor.rossi10@gmail.com';
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
        // Botões de editar/excluir (só para dono ou admin)
        let editDeleteHTML = '';
        if (c.userId === currentUser.uid || isAdmin()) {
          editDeleteHTML = `
            <div class="flex gap-2 mt-2">
              <button class="edit-catch-btn bg-yellow-400 hover:bg-yellow-500 text-white px-3 py-1 rounded" data-catch-id="${c.id}"><i class="fas fa-edit"></i> Editar</button>
              <button class="delete-catch-btn bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded" data-catch-id="${c.id}"><i class="fas fa-trash"></i> Excluir</button>
            </div>
          `;
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
                    ${editDeleteHTML}
                </div>
            </div>`;
        feedContainer.appendChild(card);
    });
    document.querySelectorAll('.like-btn').forEach(btn => btn.addEventListener('click', handleLikeClick));
    document.querySelectorAll('.comment-form').forEach(form => form.addEventListener('submit', handleCommentSubmit));
    // Eventos para editar/excluir
    document.querySelectorAll('.edit-catch-btn').forEach(btn => btn.addEventListener('click', handleEditCatch));
    document.querySelectorAll('.delete-catch-btn').forEach(btn => btn.addEventListener('click', handleDeleteCatch));
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

// Funções base para editar/excluir
async function handleEditCatch(e) {
  const catchId = e.currentTarget.dataset.catchId;
  // Buscar dados da captura
  const catchDocRef = doc(db, `artifacts/${appId}/public/data/catches`, catchId);
  const catchDoc = await getDoc(catchDocRef);
  if (!catchDoc.exists()) return;
  const c = catchDoc.data();
  // Permissão: só dono ou admin
  if (c.userId !== currentUser.uid && !isAdmin()) {
    alert('Você não tem permissão para editar esta captura.');
    return;
  }
  // Preencher modal
  editingCatchId = catchId;
  editSpecies.value = c.species;
  editWeight.value = c.weight;
  editCurrentPhoto.src = c.photoURL || '';
  editingPhotoURL = c.photoURL || '';
  editFileNameDisplay.textContent = '';
  editCatchError.textContent = '';
  editCatchModal.style.display = 'flex';
}

async function handleDeleteCatch(e) {
  const catchId = e.currentTarget.dataset.catchId;
  // Buscar dados da captura
  const catchDocRef = doc(db, `artifacts/${appId}/public/data/catches`, catchId);
  const catchDoc = await getDoc(catchDocRef);
  if (!catchDoc.exists()) return;
  const c = catchDoc.data();
  // Permissão: só dono ou admin
  if (c.userId !== currentUser.uid && !isAdmin()) {
    alert('Você não tem permissão para excluir esta captura.');
    return;
  }
  // Confirmação
  if (!confirm('Tem certeza que deseja excluir esta captura?')) {
    return;
  }
  try {
    // Excluir documento
    await deleteDoc(catchDocRef);
    // Se há foto, tentar excluir do storage (opcional)
    if (c.photoURL && c.photoURL.includes('supabase')) {
      try {
        // Extrair caminho relativo do arquivo no Supabase
        const urlParts = c.photoURL.split('/');
        const fileName = urlParts[urlParts.length - 1].split('?')[0];
        const filePath = `capturas/${fileName}`;
        await supabase.storage.from(SUPABASE_BUCKET).remove([filePath]);
      } catch (storageError) {
        console.log('Erro ao excluir foto do storage:', storageError);
        // Não falha se não conseguir excluir a foto
      }
    }
    setupListeners();
  } catch (error) {
    console.error('Erro ao excluir captura:', error);
    alert('Erro ao excluir captura. Tente novamente.');
  }
}

// --- EDIÇÃO DE CAPTURA ---
const editCatchForm = document.getElementById('edit-catch-form');
const editSpecies = document.getElementById('edit-species');
const editWeight = document.getElementById('edit-weight');
const editFishPhotoInput = document.getElementById('edit-fish-photo-input');
const editCurrentPhoto = document.getElementById('edit-current-photo');
const editFileNameDisplay = document.getElementById('edit-file-name');
const editCatchError = document.getElementById('edit-catch-error');
const submitEditCatchBtn = document.getElementById('submit-edit-catch-btn');
let editingCatchId = null;
let editingPhotoURL = '';

editFishPhotoInput.addEventListener('change', () => {
  if (editFishPhotoInput.files.length > 0) {
    editFileNameDisplay.textContent = editFishPhotoInput.files[0].name;
  } else {
    editFileNameDisplay.textContent = '';
  }
});

editCatchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  editCatchError.textContent = '';
  submitEditCatchBtn.disabled = true;
  submitEditCatchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
  const species = editSpecies.value.trim();
  const weight = parseFloat(editWeight.value);
  const file = editFishPhotoInput.files[0];
  if (!species || !weight) {
    editCatchError.textContent = 'Espécie e peso são obrigatórios!';
    submitEditCatchBtn.disabled = false;
    submitEditCatchBtn.innerHTML = 'Salvar Alterações';
    return;
  }
  if (weight <= 0) {
    editCatchError.textContent = 'O peso deve ser maior que zero!';
    submitEditCatchBtn.disabled = false;
    submitEditCatchBtn.innerHTML = 'Salvar Alterações';
    return;
  }
  try {
    let photoURL = editingPhotoURL;
    if (file) {
      photoURL = await uploadToSupabase(file, currentUser.uid);
    }
    const catchDocRef = doc(db, `artifacts/${appId}/public/data/catches`, editingCatchId);
    await updateDoc(catchDocRef, {
      species,
      weight,
      photoURL
    });
    document.getElementById('edit-catch-modal').style.display = 'none';
    editCatchForm.reset();
    editFileNameDisplay.textContent = '';
    setupListeners();
  } catch (err) {
    console.error('Erro ao editar captura:', err);
    editCatchError.textContent = 'Erro ao salvar alterações. Tente novamente.';
  } finally {
    submitEditCatchBtn.disabled = false;
    submitEditCatchBtn.innerHTML = 'Salvar Alterações';
  }
});

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

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginError.style.color = '';
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email || !password) {
    loginError.textContent = 'Preencha todos os campos!';
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
    hideAuthModal();
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
      loginError.textContent = 'E-mail ou senha incorretos.';
    } else {
      loginError.textContent = 'Erro ao fazer login. Tente novamente.';
    }
  }
});

const profileBtn = document.getElementById('profile-btn');
const editProfileModal = document.getElementById('edit-profile-modal');
const editProfileForm = document.getElementById('edit-profile-form');
const editNickname = document.getElementById('edit-nickname');
const editAvatarOptions = document.querySelectorAll('.edit-avatar-option');
const editAvatar = document.getElementById('edit-avatar');
const editAvatarError = document.getElementById('edit-avatar-error');
const editProfileError = document.getElementById('edit-profile-error');

function showProfileBtn() {
  profileBtn.classList.remove('hidden');
}
function hideProfileBtn() {
  profileBtn.classList.add('hidden');
}

profileBtn.addEventListener('click', () => {
  // Preencher campos com dados atuais
  editNickname.value = currentUser.nickname || '';
  editAvatar.value = currentUser.photoURL || '';
  editAvatarOptions.forEach(o => {
    if (o.getAttribute('data-avatar') === currentUser.photoURL) {
      o.classList.add('border-blue-500');
    } else {
      o.classList.remove('border-blue-500');
    }
  });
  editProfileModal.style.display = 'flex';
});

editAvatarOptions.forEach(option => {
  option.addEventListener('click', () => {
    editAvatarOptions.forEach(o => o.classList.remove('border-blue-500'));
    option.classList.add('border-blue-500');
    editAvatar.value = option.getAttribute('data-avatar');
    editAvatarError.textContent = '';
  });
});

document.addEventListener('click', (e) => {
  if (e.target === editProfileModal) {
    editProfileModal.style.display = 'none';
    editProfileError.textContent = '';
    editAvatarError.textContent = '';
  }
});

editProfileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  editProfileError.textContent = '';
  editAvatarError.textContent = '';
  const nickname = editNickname.value.trim();
  const photoURL = editAvatar.value;
  if (!nickname) {
    editProfileError.textContent = 'O nome de guerra é obrigatório!';
    return;
  }
  if (!photoURL) {
    editAvatarError.textContent = 'Escolha um avatar!';
    return;
  }
  try {
    const file = editProfilePhotoInput.files[0];
    console.log('Arquivo:', file);
    console.log('Tipo:', typeof file);
    console.log('Nome:', file.name);
    let photoURL = '';
    if (file) {
      console.log('Usuário autenticado:', supabase.auth.getUser());
      photoURL = await uploadToSupabase(file, currentUser.uid);
    } else {
      photoURL = editAvatar.value;
    }
    await setDoc(firestoreDoc(db, 'users', currentUser.uid), {
      nickname,
      photoURL
    }, { merge: true });
    currentUser.nickname = nickname;
    currentUser.photoURL = photoURL;
    // Atualizar todas as capturas do usuário
    const catchesQuery = query(collection(db, `artifacts/${appId}/public/data/catches`), where('userId', '==', currentUser.uid));
    const snapshot = await getDocs(catchesQuery);
    const batch = writeBatch(db);
    snapshot.forEach(docSnap => {
      batch.update(docSnap.ref, {
        userNickname: nickname,
        userPhotoURL: photoURL
      });
    });
    await batch.commit();
    editProfileModal.style.display = 'none';
    setupListeners();
  } catch (err) {
    console.error("Erro detalhado:", err);
    editProfileError.textContent = "Erro ao salvar perfil. Tente novamente.";
  }
});

// Mostrar botão de perfil quando logado
onAuthStateChanged(auth, async (user) => {
  if (user) {
    showProfileBtn();
    // ...restante do código...
  } else {
    hideProfileBtn();
    // ...restante do código...
  }
});

async function uploadToSupabase(file, userId) {
  const fileExt = file.name.split('.').pop();
  const filePath = `capturas/${userId}_${Date.now()}.${fileExt}`;
  const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).upload(filePath, file);
  if (error) {
    console.error('Erro detalhado:', error);
    throw error;
  }
  // Gerar URL pública
  const { data: publicUrlData } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath);
  console.log('URL gerada:', publicUrlData.publicUrl);
  return publicUrlData.publicUrl;
} 