const supabaseUrl = 'https://bjvxoipmvzyiarurthhj.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqdnhvaXBtdnp5aWFydXJ0aGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1ODAzMTgsImV4cCI6MjA3MDE1NjMxOH0.-76MObuwwveLnITqzusR_r1S2vM9BMEnYfdZiwzf9UU';
        const supabase = window.supabase.createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true
            }
        });

        // Google API config
        const GOOGLE_API_KEY = 'AIzaSyADAtYJz0IT0bnLZkiTSS0ND7MbwRbzqKo'; 
        const GOOGLE_CX = '1047ca13cc6044e1b';

        // UI elements
        const logoutBtn = document.getElementById('logout-btn');
        const sortSelect = document.getElementById('sort-select');
        const mangaList = document.getElementById('manga-list');

        let user = null;
        let mangas = [];
        let currentManga = null;
        let selectedCoverUrl = null;

        // ---------- SESSION & AUTH HANDLING ----------

        // Called when Google Identity Services returns credential after login
        async function handleCredentialResponse(response) {
            const jwt = response.credential;
            
            // Fixed sign-in call (changed idToken to token)
            const { data, error } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: jwt,  // This was the key fix
            });

            if (error) {
                console.error('Supabase sign-in error:', error.message);
                showNotification('Falha no login. Por favor, tente novamente.');
                return;
            }

            user = data.user;
            console.log('User signed in via Supabase:', user.email);

            updateUIOnLogin();
            await loadFromSupabase();
        }

        window.handleCredentialResponse = handleCredentialResponse;

        // Called on logout button click
        logoutBtn.addEventListener('click', async () => {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error('Logout error:', error.message);
                return;
            }
            user = null;
            mangas = [];
            updateMangaList();
            updateUIOnLogout();
            showNotification('Você saiu da sua conta.');
        });

        // Listen to auth state changes
        supabase.auth.onAuthStateChange((_event, session) => {
            if (session && session.user) {
                user = session.user;
                console.log('Auth state changed: logged in as', user.email);
                updateUIOnLogin();
                loadFromSupabase();
            } else {
                console.log('Auth state changed: logged out');
                user = null;
                mangas = [];
                updateMangaList();
                updateUIOnLogout();
            }
        });

        // On page load, check session and update UI
        window.onload = async () => {
            setupModalEvents();

            const { data: { session } } = await supabase.auth.getSession();
            if (session && session.user) {
                user = session.user;
                console.log('Session active: user logged in', user.email);
                updateUIOnLogin();
                await loadFromSupabase();
            } else {
                console.log('No active session: user not logged in');
                updateUIOnLogout();
            }
            
            // Add sort functionality
            sortSelect.addEventListener('change', () => {
                updateMangaList();
            });
        };

        // UI helpers to show/hide buttons
        function updateUIOnLogin() {
            logoutBtn.style.display = 'inline-block';
            document.querySelector('.g_id_signin').style.display = 'none';
        }

        function updateUIOnLogout() {
            logoutBtn.style.display = 'none';
            document.querySelector('.g_id_signin').style.display = 'block';
        }

        // ---------- MANGA DATA HANDLING (FIXED RLS ISSUE) ----------

        // Load manga list from Supabase for logged in user
        async function loadFromSupabase() {
            if (!user) return;

            const { data, error } = await supabase
                .from('user_readings')
                .select('*')
                .eq('user_id', user.id);  // Changed to user.id for RLS

            if (error) {
                console.error('Error loading mangas from Supabase:', error);
                showNotification('Erro ao carregar mangás. Tente novamente.');
                return;
            }

            mangas = data.map(entry => ({
                id: entry.id,
                title: entry.manga_title,
                chapter: entry.chapter,
                link: entry.link,
                coverUrl: entry.manga_cover || 'https://via.placeholder.com/280x380?text=Sem+Capa',
                updatedAt: entry.updated_at,
            }));

            updateMangaList();
        }

        // Save manga list to Supabase with proper RLS structure
        async function saveToSupabase() {
            if (!user) return;

            try {
                // Prepare data with user_id for RLS
                const mangaData = mangas.map(manga => ({
                    id: manga.id,
                    user_id: user.id,  // CRITICAL FIX: Added user_id for RLS policy
                    manga_title: manga.title,
                    chapter: manga.chapter,
                    manga_cover: manga.coverUrl,
                    link: manga.link,
                    updated_at: manga.updatedAt || new Date().toISOString(),
                }));

                // Upsert all manga records
                const { error } = await supabase.from('user_readings').upsert(mangaData, {
                    onConflict: 'id'
                });

                if (error) {
                    console.error('Error saving mangas:', error);
                    showNotification('Erro ao salvar mangás. Tente novamente.');
                } else {
                    console.log('Mangas saved to Supabase.');
                }
            } catch (e) {
                console.error('Error saving mangas:', e);
                showNotification('Erro ao salvar mangás. Tente novamente.');
            }
        }

        // Add a new manga
        async function addManga() {
            // Only proceed if user is logged in
            if (!user) {
                showNotification('Faça login para adicionar mangás.');
                return;
            }

            const title = document.getElementById('manga-title').value.trim();
            const chapterInput = document.getElementById('manga-chapter').value.trim();
            const link = document.getElementById('manga-link').value.trim() || '#';
            const coverUrlInput = document.getElementById('manga-cover-url').value.trim();

            if (!title) {
                showNotification('Preencha pelo menos o título!');
                return;
            }

            // Validate chapter
            const chapter = parseInt(chapterInput);
            if (isNaN(chapter) || chapter < 0 || !Number.isInteger(chapter)) {
                showNotification('Capítulo deve ser um número inteiro positivo!');
                return;
            }

            // If cover URL given, add immediately
            if (coverUrlInput) {
                createMangaItem(title, chapter, link, coverUrlInput);
                return;
            }

            // Else, search covers via Google Images
            currentManga = { title, chapter, link };
            await searchCovers(title);
        }

        // Create a manga item locally and save
        function createMangaItem(title, chapter, link, coverUrl) {
            const newManga = {
                id: crypto.randomUUID(),
                title,
                chapter,
                link,
                coverUrl: coverUrl || 'https://via.placeholder.com/280x380?text=Sem+Capa',
                updatedAt: new Date().toISOString(),
            };

            mangas.unshift(newManga);
            saveToSupabase();
            updateMangaList();

            // Reset inputs
            document.getElementById('manga-title').value = '';
            document.getElementById('manga-chapter').value = '';
            document.getElementById('manga-link').value = '';
            document.getElementById('manga-cover-url').value = '';
            
            // Show success notification
            showNotification(`"${title}" adicionado à biblioteca!`);
        }
        
        function showNotification(message) {
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: var(--primary);
                color: white;
                padding: 15px 25px;
                border-radius: var(--border-radius);
                box-shadow: var(--shadow);
                z-index: 1000;
                animation: fadeInOut 3s ease;
            `;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.style.animation = 'fadeOut 0.5s ease forwards';
                setTimeout(() => notification.remove(), 500);
            }, 2500);
        }

        // Update chapter of a manga
        function updateChapter(id) {
            const manga = mangas.find(m => m.id === id);
            if (!manga) return;

            const newChapterInput = prompt(`Atualizar capítulo para ${manga.title}:\nCapítulo atual: ${manga.chapter}`, manga.chapter);
            if (newChapterInput === null) return; // User canceled
            
            const newChapter = parseInt(newChapterInput);
            if (isNaN(newChapter) || newChapter < 0 || !Number.isInteger(newChapter)) {
                showNotification('Capítulo deve ser um número inteiro positivo!');
                return;
            }

            manga.chapter = newChapter;
            manga.updatedAt = new Date().toISOString();
            saveToSupabase();
            updateMangaList();
            
            showNotification(`Capítulo de "${manga.title}" atualizado para ${newChapter}!`);
        }

        // Remove manga from list
        function removeManga(id) {
            const manga = mangas.find(m => m.id === id);
            if (!manga) return;
            
            if (!confirm(`Tem certeza que deseja remover "${manga.title}" da sua biblioteca?`)) return;

            mangas = mangas.filter(m => m.id !== id);
            saveToSupabase();
            updateMangaList();
            
            showNotification(`"${manga.title}" removido da biblioteca!`);
        }

        // Update manga list UI
        function updateMangaList() {
            const listElement = document.getElementById('manga-list');
            listElement.innerHTML = '';

            if (mangas.length === 0) {
                listElement.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-book-open"></i>
                        <h3>Sua biblioteca está vazia</h3>
                        <p>Adicione seu primeiro mangá para começar</p>
                    </div>`;
                return;
            }

            // Sort mangas based on selection
            const sortedMangas = [...mangas];
            const sortOption = sortSelect.value;
            
            if (sortOption === 'title') {
                sortedMangas.sort((a, b) => a.title.localeCompare(b.title));
            } else if (sortOption === 'chapter') {
                sortedMangas.sort((a, b) => b.chapter - a.chapter);
            } else {
                sortedMangas.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            }

            sortedMangas.forEach(manga => {
                const mangaCard = document.createElement('div');
                mangaCard.className = 'manga-card';

                mangaCard.innerHTML = `
                    <div class="manga-cover-container">
                        <img src="${manga.coverUrl}" alt="${manga.title}" class="manga-cover"
                             onerror="this.src='https://via.placeholder.com/280x380?text=Capa+Não+Disponível'">
                        <div class="chapter-badge">Cap. ${manga.chapter}</div>
                    </div>
                    <div class="manga-info">
                        <h3 class="manga-title" title="${manga.title}">${manga.title}</h3>
                        <div class="manga-meta">
                            <span>${formatTimeAgo(manga.updatedAt)}</span>
                        </div>
                        <div class="manga-actions">
                            <a href="${manga.link}" target="_blank" class="secondary-btn">
                                <i class="fas fa-external-link-alt"></i> Ler
                            </a>
                            <button onclick="updateChapter('${manga.id}')" class="secondary-btn">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button onclick="removeManga('${manga.id}')" class="secondary-btn">
                                <i class="fas fa-trash"></i> Remover
                            </button>
                        </div>
                    </div>`;

                listElement.appendChild(mangaCard);
            });
        }

        // ---------- GOOGLE IMAGE SEARCH FOR COVERS ----------

        async function searchCovers(title) {
            const modal = document.getElementById('cover-modal');
            const resultsContainer = document.getElementById('cover-results');

            modal.style.display = 'block';
            resultsContainer.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Buscando capas para "${title}"...</p>
                </div>`;

            try {
                const query = `Capa "${title}" manga OR manhwa OR comic`;
                const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&searchType=image&key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&num=8`;

                const response = await fetch(url);
                const data = await response.json();

                if (data.items && data.items.length > 0) {
                    resultsContainer.innerHTML = '';
                    data.items.forEach((item, index) => {
                        const coverOption = document.createElement('div');
                        coverOption.className = 'cover-option';
                        coverOption.dataset.url = item.link;
                        coverOption.innerHTML = `<img src="${item.link}" alt="Capa ${index + 1}" loading="lazy">`;
                        coverOption.addEventListener('click', () => selectCover(item.link));
                        resultsContainer.appendChild(coverOption);
                    });
                } else {
                    resultsContainer.innerHTML = `
                        <div class="loading-state">
                            <i class="fas fa-exclamation-circle"></i>
                            <p>Nenhuma capa encontrada para "${title}".</p>
                            <p>Por favor, adicione manualmente.</p>
                        </div>`;
                }
            } catch (error) {
                console.error('Erro na busca de capas:', error);
                resultsContainer.innerHTML = `
                    <div class="loading-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Ocorreu um erro ao buscar capas.</p>
                        <p>Por favor, adicione manualmente.</p>
                    </div>`;
            }
        }

        // Select cover from modal
        function selectCover(url) {
            document.querySelectorAll('.cover-option').forEach(opt => opt.classList.remove('selected'));
            const selectedOption = document.querySelector(`.cover-option[data-url="${url}"]`);
            if (selectedOption) {
                selectedOption.classList.add('selected');
                selectedCoverUrl = url;
            }
        }

        // Modal event handlers
        function setupModalEvents() {
            const modal = document.getElementById('cover-modal');
            const closeBtn = document.querySelector('.close');
            const cancelBtn = document.getElementById('cancel-cover');
            const confirmBtn = document.getElementById('confirm-cover');

            closeBtn.addEventListener('click', closeModal);
            cancelBtn.addEventListener('click', closeModal);
            window.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
            confirmBtn.addEventListener('click', () => {
                if (currentManga && selectedCoverUrl) {
                    createMangaItem(
                        currentManga.title,
                        currentManga.chapter,
                        currentManga.link,
                        selectedCoverUrl
                    );
                }
                closeModal();
            });

            function closeModal() {
                modal.style.display = 'none';
                currentManga = null;
                selectedCoverUrl = null;
            }
        }

        // ---------- UTILS ----------

        function formatDate(date) {
            const options = { day: 'numeric', month: 'long', year: 'numeric' };
            return new Date(date).toLocaleDateString('pt-BR', options);
        }

        function formatTimeAgo(date) {
            const now = new Date();
            const diff = now - new Date(date);
            const minutes = Math.floor(diff / (1000 * 60));
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));

            if (minutes < 1) return 'agora mesmo';
            if (minutes < 60) {
                return `${minutes} minuto${minutes > 1 ? 's' : ''} atrás`;
            }
            if (hours < 24) {
                if (hours === 1) return '1 hora atrás';
                return `${hours} horas atrás`;
            }
            if (days === 1) return 'ontem';
            if (days < 7) return `${days} dias atrás`;
            return formatDate(date);
        }
        
        // Add CSS for notification animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateY(20px); }
                10% { opacity: 1; transform: translateY(0); }
                90% { opacity: 1; transform: translateY(0); }
                100% { opacity: 0; transform: translateY(20px); }
            }
            @keyframes fadeOut {
                to { opacity: 0; transform: translateY(20px); }
            }
        `;
        document.head.appendChild(style);