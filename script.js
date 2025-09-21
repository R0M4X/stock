const loadingOverlay = document.getElementById('loading-overlay');
window.addEventListener('load', () => {
    // Se oculta después de que la animación tenga tiempo de ejecutarse
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
    }, 3500); 
});

// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyDr4_MoqZEUsbSwlOaKtteNvcGvGU7zhZE",
    authDomain: "stock-inventario-b84ea.firebaseapp.com",
    projectId: "stock-inventario-b84ea",
    storageBucket: "stock-inventario-b84ea.firebasestorage.app",
    messagingSenderId: "706223379754",
    appId: "1:706223379754:web:91621483424e5744447a53"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global variables
let categories = [];
let products = [];
let sales = [];
let cart = [];
let currentEditingProduct = null;
let currentEditingCategory = null;
let currentUser = null;
let isLoggedIn = false;
let backupInterval = null;
let priceUpdatePreview = [];

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    showLoading(true);
    checkAuthState();
    // Listener para el input de escaneo en la sección de ventas
    document.getElementById('saleBarcodeScanInput').addEventListener('keyup', handleBarcodeScan);
});

// Authentication Functions
function checkAuthState() {
    onAuthStateChanged(auth, (user) => {
        showLoading(false);
        if (user) {
            currentUser = user;
            isLoggedIn = true;
            document.getElementById('userEmail').textContent = user.email;
            showMainApp();
            loadUserData();
            startAutoBackup();
        } else {
            currentUser = null;
            isLoggedIn = false;
            showLoginScreen();
        }
    });
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
}

function showLoading(show) {
    document.getElementById('loadingSpinner').style.display = show ? 'block' : 'none';
}

window.toggleAuthMode = function() {
    const loginBtn = document.getElementById('loginBtn');
    const switchText = document.querySelector('.login-switch');

    if (loginBtn.textContent === 'Iniciar Sesión') {
        loginBtn.textContent = 'Registrarse';
        switchText.textContent = '¿Ya tienes cuenta? Inicia sesión';
    } else {
        loginBtn.textContent = 'Iniciar Sesión';
        switchText.textContent = '¿No tienes cuenta? Regístrate';
    }
};

window.resetPassword = async function() {
    const email = document.getElementById('loginEmail').value;
    if (!email) {
        showAlert('Por favor, ingrese su email primero', 'error');
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        showAlert('Email de recuperación enviado correctamente', 'success');
    } catch (error) {
        showAlert('Error al enviar email de recuperación: ' + error.message, 'error');
    }
};

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');
    const isRegister = loginBtn.textContent === 'Registrarse';

    if (!email || !password) {
        showAlert('Por favor, complete todos los campos', 'error');
        return;
    }

    showLoading(true);
    loginBtn.disabled = true;

    try {
        if (isRegister) {
            await createUserWithEmailAndPassword(auth, email, password);
            showAlert('Cuenta creada exitosamente', 'success');
        } else {
            await signInWithEmailAndPassword(auth, email, password);
            showAlert('Sesión iniciada correctamente', 'success');
        }
    } catch (error) {
        let errorMessage = 'Error en la autenticación';
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'Usuario no encontrado';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Contraseña incorrecta';
        } else if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'El email ya está en uso';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'La contraseña debe tener al menos 6 caracteres';
        }
        showAlert(errorMessage, 'error');
    } finally {
        showLoading(false);
        loginBtn.disabled = false;
    }
});

window.logout = async function() {
    try {
        await signOut(auth);
        clearLocalData();
        stopAutoBackup();
        showAlert('Sesión cerrada correctamente', 'success');
    } catch (error) {
        showAlert('Error al cerrar sesión', 'error');
    }
};

// Firebase Data Functions
async function saveToFirebase(collectionName, data) {
    if (!currentUser) return false;

    try {
        setSyncStatus('pending');
        await setDoc(doc(db, 'users', currentUser.uid, collectionName, 'data'), {
            data: data,
            lastUpdated: new Date().toISOString()
        });
        setSyncStatus('success');
        return true;
    } catch (error) {
        console.error('Error saving to Firebase:', error);
        setSyncStatus('error');
        return false;
    }
}

async function loadFromFirebase(collectionName) {
    if (!currentUser) return null;

    try {
        const docRef = doc(db, 'users', currentUser.uid, collectionName, 'data');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data().data || [];
        }
        return [];
    } catch (error) {
        console.error('Error loading from Firebase:', error);
        return null;
    }
}

async function loadUserData() {
    try {
        showLoading(true);

        const loadedCategories = await loadFromFirebase('categories');
        const loadedProducts = await loadFromFirebase('products');
        const loadedSales = await loadFromFirebase('sales');

        if (loadedCategories !== null) categories = loadedCategories;
        if (loadedProducts !== null) products = loadedProducts;
        if (loadedSales !== null) sales = loadedSales;

        updateAllData();
        showAlert('Datos sincronizados correctamente', 'success');
    } catch (error) {
        showAlert('Error al cargar datos del usuario', 'error');
    } finally {
        showLoading(false);
    }
}

async function saveAllData() {
    if (!currentUser) return;

    const promises = [
        saveToFirebase('categories', categories),
        saveToFirebase('products', products),
        saveToFirebase('sales', sales)
    ];

    try {
        await Promise.all(promises);
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

function setSyncStatus(status) {
    const syncElement = document.getElementById('syncStatus');
    syncElement.className = 'sync-status';

    switch (status) {
        case 'success':
            syncElement.textContent = 'Sincronizado';
            syncElement.classList.add('sync-success');
            break;
        case 'error':
            syncElement.textContent = 'Error';
            syncElement.classList.add('sync-error');
            break;
        case 'pending':
            syncElement.textContent = 'Sincronizando...';
            syncElement.classList.add('sync-pending');
            break;
    }
}

// Auto Backup Functions
function startAutoBackup() {
    const interval = parseInt(localStorage.getItem('backupInterval') || '12');
    if (backupInterval) clearInterval(backupInterval);

    backupInterval = setInterval(() => {
        if (isLoggedIn) {
            autoBackup();
        }
    }, interval * 60 * 60 * 1000);
}

function stopAutoBackup() {
    if (backupInterval) {
        clearInterval(backupInterval);
        backupInterval = null;
    }
}

async function autoBackup() {
    try {
        await saveAllData();
        await saveBackupRecord('automatic', 'success');
        console.log('Auto backup completed successfully');
    } catch (error) {
        await saveBackupRecord('automatic', 'error');
        console.error('Auto backup failed:', error);
    }
}

window.manualBackup = async function() {
    if (!currentUser) {
        showAlert('Debe iniciar sesión para realizar backups', 'error');
        return;
    }

    showLoading(true);
    try {
        await saveAllData();
        await saveBackupRecord('manual', 'success');
        showAlert('Backup manual completado exitosamente', 'success');
    } catch (error) {
        await saveBackupRecord('manual', 'error');
        showAlert('Error al realizar backup manual', 'error');
    } finally {
        showLoading(false);
    }
};

async function saveBackupRecord(type, status) {
    if (!currentUser) return;

    try {
        const backupRecord = {
            date: new Date().toISOString(),
            type: type,
            status: status,
            dataCount: {
                categories: categories.length,
                products: products.length,
                sales: sales.length
            }
        };

        await setDoc(doc(db, 'users', currentUser.uid, 'backups', Date.now().toString()), backupRecord);
        updateBackupHistory();
    } catch (error) {
        console.error('Error saving backup record:', error);
    }
}

async function updateBackupHistory() {
    if (!currentUser) return;

    try {
        const querySnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'backups'));
        const backups = [];
        querySnapshot.forEach((doc) => {
            backups.push({ id: doc.id, ...doc.data() });
        });

        backups.sort((a, b) => new Date(b.date) - new Date(a.date));
        displayBackupHistory(backups.slice(0, 10));
    } catch (error) {
        console.error('Error loading backup history:', error);
    }
}

function displayBackupHistory(backups) {
    const tbody = document.getElementById('backupHistoryTableBody');

    if (backups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #666;">No hay backups registrados</td></tr>';
        return;
    }

    tbody.innerHTML = backups.map(backup => {
        const date = new Date(backup.date).toLocaleString('es-AR');
        const statusClass = backup.status === 'success' ? 'profit-positive' : 'profit-negative';
        const typeText = backup.type === 'automatic' ? '⏰ Automático' : '👤 Manual';
        const statusText = backup.status === 'success' ? '✅ Exitoso' : '❌ Error';

        return `
            <tr>
                <td>${date}</td>
                <td>${typeText}</td>
                <td class="${statusClass}">${statusText}</td>
                <td>
                    <button class="btn btn-info btn-small" onclick="restoreBackup('${backup.id}')" title="Restaurar">📥</button>
                </td>
            </tr>
        `;
    }).join('');
}

window.restoreFromFirebase = async function() {
    if (!currentUser) {
        showAlert('Debe iniciar sesión para restaurar datos', 'error');
        return;
    }

    if (!confirm('¿Está seguro de que desea restaurar los datos desde Firebase? Esto reemplazará todos los datos actuales.')) {
        return;
    }

    showLoading(true);
    try {
        await loadUserData();
        showAlert('Datos restaurados exitosamente desde Firebase', 'success');
    } catch (error) {
        showAlert('Error al restaurar datos desde Firebase', 'error');
    } finally {
        showLoading(false);
    }
};

window.saveBackupSettings = function() {
    const interval = document.getElementById('backupInterval').value;
    localStorage.setItem('backupInterval', interval);
    startAutoBackup();
    showAlert('Configuración de backup guardada', 'success');
};

function clearLocalData() {
    categories = [];
    products = [];
    sales = [];
    cart = [];
    currentEditingProduct = null;
    currentEditingCategory = null;
}

window.showSection = function(sectionName) {
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));

    document.getElementById(sectionName).classList.add('active');
    event.target.classList.add('active');

    updateSectionData(sectionName);
};

function updateSectionData(sectionName) {
    switch (sectionName) {
        case 'dashboard':
            updateDashboard();
            break;
        case 'categories':
            updateCategoriesTable();
            break;
        case 'products':
            updateProductsTable();
            updateProductCategories();
            break;
        case 'sales':
            updateSaleProducts();
            updateSalesHistoryTable();
            document.getElementById('saleBarcodeScanInput').focus();
            break;
        case 'reports':
            updateReports();
            break;
        case 'settings':
            loadBusinessInfo();
            updateBackupHistory();
            break;
    }
}

// Category Management
window.addCategory = async function() {
    const name = document.getElementById('categoryName').value.trim();
    const description = document.getElementById('categoryDescription').value.trim();

    if (!name) {
        showAlert('Por favor, ingrese el nombre de la categoría', 'error');
        return;
    }

    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        showAlert('Ya existe una categoría con ese nombre', 'error');
        return;
    }

    const category = {
        id: Date.now().toString(),
        name,
        description,
        createdAt: new Date().toISOString()
    };

    categories.push(category);
    clearCategoryForm();
    updateCategoriesTable();
    updateProductCategories();
    updateDashboard();
    await saveToFirebase('categories', categories);
    showAlert('Categoría agregada correctamente', 'success');
};

window.updateCategory = async function() {
    if (!currentEditingCategory) return;

    const name = document.getElementById('categoryName').value.trim();
    const description = document.getElementById('categoryDescription').value.trim();

    if (!name) {
        showAlert('Por favor, ingrese el nombre de la categoría', 'error');
        return;
    }

    if (categories.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== currentEditingCategory)) {
        showAlert('Ya existe otra categoría con ese nombre', 'error');
        return;
    }

    const categoryIndex = categories.findIndex(c => c.id === currentEditingCategory);
    if (categoryIndex === -1) return;

    const updatedCategory = { ...categories[categoryIndex],
        name,
        description,
        updatedAt: new Date().toISOString()
    };

    categories[categoryIndex] = updatedCategory;

    products.forEach(product => {
        if (product.categoryId === currentEditingCategory) {
            product.categoryName = name;
        }
    });

    clearCategoryForm();
    updateCategoriesTable();
    updateProductCategories();
    updateProductsTable();
    await saveToFirebase('categories', categories);
    await saveToFirebase('products', products);
    showAlert('Categoría actualizada correctamente', 'success');
};

window.editCategory = function(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryDescription').value = category.description || '';
    currentEditingCategory = categoryId;

    document.getElementById('updateCategoryBtn').style.display = 'inline-flex';
    document.querySelector('#categories .btn-primary').style.display = 'none';
    document.getElementById('categories').scrollIntoView({ behavior: 'smooth' });
};

window.deleteCategory = async function(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    const categoryProducts = products.filter(p => p.categoryId === categoryId);
    if (categoryProducts.length > 0) {
        showAlert(`No se puede eliminar la categoría "${category.name}" porque tiene ${categoryProducts.length} producto(s) asociado(s)`, 'error');
        return;
    }

    if (!confirm(`¿Está seguro de que desea eliminar la categoría "${category.name}"?`)) return;

    categories = categories.filter(c => c.id !== categoryId);
    updateCategoriesTable();
    updateProductCategories();
    updateDashboard();
    await saveToFirebase('categories', categories);
    showAlert('Categoría eliminada correctamente', 'success');
};

window.clearCategoryForm = function() {
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryDescription').value = '';
    currentEditingCategory = null;
    document.getElementById('updateCategoryBtn').style.display = 'none';
    document.querySelector('#categories .btn-primary').style.display = 'inline-flex';
};

window.searchCategories = function() {
    const searchTerm = document.getElementById('categorySearch').value.toLowerCase();
    const filteredCategories = categories.filter(category =>
        category.name.toLowerCase().includes(searchTerm) ||
        (category.description && category.description.toLowerCase().includes(searchTerm))
    );
    updateCategoriesTable(filteredCategories);
};

function updateCategoriesTable(categoriesToShow = categories) {
    const tbody = document.getElementById('categoriesTableBody');
    if (categoriesToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">No hay categorías registradas</td></tr>';
        return;
    }
    tbody.innerHTML = categoriesToShow.map(category => {
        const productCount = products.filter(p => p.categoryId === category.id).length;
        const createdDate = new Date(category.createdAt).toLocaleDateString('es-AR');
        return `
            <tr>
                <td><strong>${category.name}</strong></td>
                <td>${category.description || '-'}</td>
                <td><span class="category-tag">${productCount} productos</span></td>
                <td>${createdDate}</td>
                <td class="product-actions">
                    <button class="btn btn-warning btn-small" onclick="editCategory('${category.id}')" title="Editar">✏️</button>
                    <button class="btn btn-danger btn-small" onclick="deleteCategory('${category.id}')" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Product Management
function updateProductCategories() {
    const selects = [document.getElementById('productCategory'), document.getElementById('priceUpdateCategory')];
    selects.forEach(select => {
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = select.id === 'priceUpdateCategory' ?
            '<option value="">Todas las categorías</option>' :
            '<option value="">Seleccionar categoría...</option>';
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });
        if (currentValue && categories.find(c => c.id === currentValue)) {
            select.value = currentValue;
        }
    });
}

window.addProduct = async function() {
    const name = document.getElementById('productName').value.trim();
    const code = document.getElementById('productCode').value.trim();
    let barcode = document.getElementById('productBarcode').value.trim();
    const categoryId = document.getElementById('productCategory').value;
    const costPrice = parseFloat(document.getElementById('productCostPrice').value);
    const price = parseFloat(document.getElementById('productPrice').value);
    const stock = parseInt(document.getElementById('productStock').value);
    const minStock = parseInt(document.getElementById('productMinStock').value) || 5;
    const description = document.getElementById('productDescription').value.trim();

    if (!name || !code || !categoryId || isNaN(costPrice) || isNaN(price) || isNaN(stock)) {
        showAlert('Por favor, complete todos los campos obligatorios (*)', 'error');
        return;
    }
    if (costPrice < 0 || price < 0 || stock < 0) {
        showAlert('Los valores no pueden ser negativos', 'error');
        return;
    }
    if (price <= costPrice && !confirm('El precio de venta es menor o igual al precio de costo. ¿Continuar?')) {
        return;
    }
    if (products.some(p => p.code.toLowerCase() === code.toLowerCase())) {
        showAlert('Ya existe un producto con ese código', 'error');
        return;
    }
    if (barcode && products.some(p => p.barcode === barcode)) {
        showAlert('Ya existe un producto con ese código de barras', 'error');
        return;
    }
    if (!barcode) {
        barcode = generateUniqueBarcode();
    }

    const category = categories.find(c => c.id === categoryId);
    const product = {
        id: Date.now().toString(), name, code: code.toUpperCase(), barcode, categoryId,
        categoryName: category.name, costPrice, price, stock, minStock, description,
        createdAt: new Date().toISOString()
    };

    products.push(product);
    clearProductForm();
    updateProductsTable();
    updateSaleProducts();
    updateDashboard();
    await saveToFirebase('products', products);
    showAlert('Producto agregado correctamente', 'success');
};

window.updateProduct = async function() {
    if (!currentEditingProduct) return;
    const name = document.getElementById('productName').value.trim();
    const code = document.getElementById('productCode').value.trim();
    const barcode = document.getElementById('productBarcode').value.trim();
    const categoryId = document.getElementById('productCategory').value;
    const costPrice = parseFloat(document.getElementById('productCostPrice').value);
    const price = parseFloat(document.getElementById('productPrice').value);
    const stock = parseInt(document.getElementById('productStock').value);
    const minStock = parseInt(document.getElementById('productMinStock').value) || 5;
    const description = document.getElementById('productDescription').value.trim();

    if (!name || !code || !categoryId || isNaN(costPrice) || isNaN(price) || isNaN(stock)) {
        showAlert('Por favor, complete todos los campos obligatorios (*)', 'error');
        return;
    }
    if (costPrice < 0 || price < 0 || stock < 0) {
        showAlert('Los valores no pueden ser negativos', 'error');
        return;
    }
    if (products.some(p => p.code.toLowerCase() === code.toLowerCase() && p.id !== currentEditingProduct)) {
        showAlert('Ya existe otro producto con ese código', 'error');
        return;
    }
    if (barcode && products.some(p => p.barcode === barcode && p.id !== currentEditingProduct)) {
        showAlert('Ya existe otro producto con ese código de barras', 'error');
        return;
    }

    const productIndex = products.findIndex(p => p.id === currentEditingProduct);
    if (productIndex === -1) return;

    const category = categories.find(c => c.id === categoryId);
    const updatedProduct = {
        ...products[productIndex], name, code: code.toUpperCase(), barcode: barcode || products[productIndex].barcode,
        categoryId, categoryName: category.name, costPrice, price, stock, minStock, description,
        updatedAt: new Date().toISOString()
    };

    products[productIndex] = updatedProduct;
    clearProductForm();
    updateProductsTable();
    updateSaleProducts();
    updateDashboard();
    await saveToFirebase('products', products);
    showAlert('Producto actualizado correctamente', 'success');
};

window.editProduct = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    document.getElementById('productName').value = product.name;
    document.getElementById('productCode').value = product.code;
    document.getElementById('productBarcode').value = product.barcode || '';
    document.getElementById('productCategory').value = product.categoryId;
    document.getElementById('productCostPrice').value = product.costPrice;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productStock').value = product.stock;
    document.getElementById('productMinStock').value = product.minStock;
    document.getElementById('productDescription').value = product.description || '';

    currentEditingProduct = productId;
    document.getElementById('productFormTitle').textContent = 'Editar Producto';
    document.getElementById('updateProductBtn').style.display = 'inline-flex';
    document.getElementById('addProductBtn').style.display = 'none';

    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
};

window.deleteProduct = async function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || !confirm(`¿Está seguro de que desea eliminar el producto "${product.name}"?`)) return;

    products = products.filter(p => p.id !== productId);
    updateProductsTable();
    updateSaleProducts();
    updateDashboard();
    await saveToFirebase('products', products);
    showAlert('Producto eliminado correctamente', 'success');
};

window.clearProductForm = function() {
    document.getElementById('productName').value = '';
    document.getElementById('productCode').value = '';
    document.getElementById('productBarcode').value = '';
    document.getElementById('productCategory').value = '';
    document.getElementById('productCostPrice').value = '';
    document.getElementById('productPrice').value = '';
    document.getElementById('productStock').value = '';
    document.getElementById('productMinStock').value = '';
    document.getElementById('productDescription').value = '';

    currentEditingProduct = null;
    document.getElementById('productFormTitle').textContent = 'Agregar Nuevo Producto';
    document.getElementById('updateProductBtn').style.display = 'none';
    document.getElementById('addProductBtn').style.display = 'inline-flex';
};

window.searchProducts = function() {
    const searchTerm = document.getElementById('productSearch').value.toLowerCase();
    const filteredProducts = products.filter(product =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.code.toLowerCase().includes(searchTerm) ||
        product.categoryName.toLowerCase().includes(searchTerm) ||
        (product.barcode && product.barcode.includes(searchTerm))
    );
    updateProductsTable(filteredProducts);
};

function updateProductsTable(productsToShow = products) {
    const tbody = document.getElementById('productsTableBody');
    if (productsToShow.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: #666;">No hay productos registrados</td></tr>';
        return;
    }
    tbody.innerHTML = productsToShow.map(product => {
        const stockStatus = getStockStatus(product);
        const rowClass = stockStatus === 'Sin stock' ? 'out-of-stock' : (stockStatus === 'Stock bajo' ? 'low-stock' : '');
        const margin = product.price > 0 ? ((product.price - product.costPrice) / product.price * 100).toFixed(1) : 0;
        const marginClass = margin > 0 ? 'profit-positive' : 'profit-negative';

        return `
            <tr class="${rowClass}">
                <td><strong>${product.code}</strong></td>
                <td>${product.name}</td>
                <td><span class="category-tag">${product.categoryName}</span></td>
                <td>$${product.costPrice.toFixed(2)}</td>
                <td>$${product.price.toFixed(2)}</td>
                <td class="${marginClass}">${margin}%</td>
                <td><strong>${product.stock}</strong></td>
                <td style="font-family: monospace; font-size: 12px;">${product.barcode || '-'}</td>
                <td><span class="status-badge">${stockStatus}</span></td>
                <td class="product-actions">
                    <button class="btn btn-warning btn-small" onclick="editProduct('${product.id}')" title="Editar">✏️</button>
                    <button class="btn btn-danger btn-small" onclick="deleteProduct('${product.id}')" title="Eliminar">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

function getStockStatus(product) {
    if (product.stock === 0) return 'Sin stock';
    if (product.stock <= product.minStock) return 'Stock bajo';
    return 'Disponible';
}

function generateUniqueBarcode() {
    let barcode;
    do {
        barcode = '200' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
    } while (products.some(p => p.barcode === barcode));
    return barcode;
}

// Barcode Functions (Sales Tab)
function handleBarcodeScan(event) {
    if (event.key === 'Enter') {
        const barcodeInput = event.target;
        const barcode = barcodeInput.value.trim();
        if (!barcode) return;

        const product = products.find(p => p.barcode === barcode);
        if (product) {
            addProductToCartByBarcode(product);
        } else {
            showAlert(`Producto con código "${barcode}" no encontrado.`, 'error');
        }
        barcodeInput.value = '';
    }
}

function addProductToCartByBarcode(product) {
    if (product.stock <= 0) {
        showAlert(`Stock insuficiente para "${product.name}".`, 'error');
        return;
    }
    const existingItem = cart.find(item => item.productId === product.id);
    const quantityToAdd = 1;
    if (existingItem) {
        if (existingItem.quantity + quantityToAdd > product.stock) {
            showAlert(`Stock insuficiente. Ya tiene ${existingItem.quantity} en el carrito.`, 'error');
            return;
        }
        existingItem.quantity += quantityToAdd;
        existingItem.subtotal = existingItem.quantity * existingItem.price;
        existingItem.profit = existingItem.quantity * (existingItem.price - existingItem.costPrice);
    } else {
        cart.push({
            productId: product.id,
            productName: product.name,
            quantity: quantityToAdd,
            price: product.price,
            costPrice: product.costPrice,
            subtotal: quantityToAdd * product.price,
            profit: quantityToAdd * (product.price - product.costPrice)
        });
    }
    updateCartTable();
    showAlert(`"${product.name}" agregado al carrito.`, 'success');
}


// Price Update Functions
window.showPriceUpdateModal = function() {
    updateProductCategories();
    document.getElementById('priceUpdateModal').style.display = 'block';
};
window.closePriceUpdateModal = function() {
    document.getElementById('priceUpdateModal').style.display = 'none';
    document.getElementById('pricePreviewContainer').style.display = 'none';
    document.getElementById('applyPriceBtn').disabled = true;
    priceUpdatePreview = [];
};
window.previewPriceUpdate = function() {
    const categoryId = document.getElementById('priceUpdateCategory').value;
    const updateType = document.getElementById('priceUpdateType').value;
    const updateValue = parseFloat(document.getElementById('priceUpdateValue').value);
    if (isNaN(updateValue) || updateValue === 0) {
        showAlert('Por favor, ingrese un valor válido', 'error');
        return;
    }
    let productsToUpdate = categoryId ? products.filter(p => p.categoryId === categoryId) : products;
    if (productsToUpdate.length === 0) {
        showAlert('No hay productos para actualizar', 'error');
        return;
    }
    priceUpdatePreview = productsToUpdate.map(product => {
        let newPrice = updateType === 'percentage' ? product.price * (1 + updateValue / 100) : product.price + updateValue;
        if (newPrice < 0) newPrice = 0;
        const change = newPrice - product.price;
        const changePercentage = product.price > 0 ? (change / product.price * 100) : 0;
        return { id: product.id, name: product.name, currentPrice: product.price, newPrice, change, changePercentage };
    });
    displayPricePreview();
    document.getElementById('pricePreviewContainer').style.display = 'block';
    document.getElementById('applyPriceBtn').disabled = false;
};

function displayPricePreview() {
    const tbody = document.getElementById('pricePreviewBody');
    tbody.innerHTML = priceUpdatePreview.map(item => {
        const changeClass = item.change >= 0 ? 'profit-positive' : 'profit-negative';
        const changeText = item.change >= 0 ? '+' : '';
        return `
            <tr class="price-change">
                <td>${item.name}</td>
                <td>$${item.currentPrice.toFixed(2)}</td>
                <td>$${item.newPrice.toFixed(2)}</td>
                <td class="${changeClass}">
                    ${changeText}$${item.change.toFixed(2)} (${changeText}${item.changePercentage.toFixed(1)}%)
                </td>
            </tr>
        `;
    }).join('');
}
window.applyPriceUpdate = async function() {
    if (priceUpdatePreview.length === 0 || !confirm(`¿Está seguro de que desea actualizar los precios de ${priceUpdatePreview.length} productos?`)) {
        return;
    }
    showLoading(true);
    try {
        priceUpdatePreview.forEach(item => {
            const productIndex = products.findIndex(p => p.id === item.id);
            if (productIndex !== -1) {
                products[productIndex].price = item.newPrice;
                products[productIndex].priceUpdatedAt = new Date().toISOString();
            }
        });
        await saveToFirebase('products', products);
        updateProductsTable();
        updateSaleProducts();
        closePriceUpdateModal();
        showAlert(`Precios actualizados correctamente para ${priceUpdatePreview.length} productos`, 'success');
    } catch (error) {
        showAlert('Error al actualizar precios', 'error');
    } finally {
        showLoading(false);
    }
};

// Barcode Labels Functions
window.showBarcodeLabelsModal = function() {
    const modal = document.getElementById('barcodeLabelsModal');
    const productsList = document.getElementById('labelProductsList');
    productsList.innerHTML = products
        .filter(p => p.barcode)
        .map(product => `
            <label style="display: block; margin-bottom: 8px; cursor: pointer;">
                <input type="checkbox" value="${product.id}" style="margin-right: 8px;">
                ${product.name} (${product.code}) - $${product.price.toFixed(2)}
            </label>
        `).join('');
    modal.style.display = 'block';
};
window.closeBarcodeLabelsModal = function() {
    document.getElementById('barcodeLabelsModal').style.display = 'none';
};
window.generateBarcodeLabels = function() {
    const checkboxes = document.querySelectorAll('#labelProductsList input[type="checkbox"]:checked');
    const selectedProducts = Array.from(checkboxes).map(cb => products.find(p => p.id === cb.value)).filter(Boolean);
    if (selectedProducts.length === 0) {
        showAlert('Por favor, seleccione al menos un producto', 'error');
        return;
    }
    const labelSize = document.getElementById('labelSize').value;
    const labelsPerRow = parseInt(document.getElementById('labelsPerRow').value);
    const printWindow = window.open('', '_blank', 'height=600,width=800');
    printWindow.document.write(createLabelHTML(selectedProducts, labelSize, labelsPerRow));
    printWindow.document.close();
    printWindow.onload = function() {
        selectedProducts.forEach(product => {
            if (product.barcode) {
                const svgElement = printWindow.document.getElementById(`barcode-${product.id}`);
                if (svgElement) {
                    JsBarcode(svgElement, product.barcode, {
                        format: "CODE128", displayValue: true, fontSize: 14, height: 30, margin: 5
                    });
                }
            }
        });
        setTimeout(() => printWindow.print(), 500);
    };
    showAlert(`Generando ${selectedProducts.length} etiquetas para impresión`, 'success');
    closeBarcodeLabelsModal();
};

function createLabelHTML(products, labelSize, labelsPerRow) {
    const sizeConfig = {
        small: { width: '4cm', height: '2cm', fontSize: '8px' },
        medium: { width: '6cm', height: '3cm', fontSize: '10px' },
        large: { width: '8cm', height: '4cm', fontSize: '12px' }
    };
    const config = sizeConfig[labelSize];
    const labelWidth = 100 / labelsPerRow;
    const labelsHTML = products.map(product => {
        if (!product.barcode) return '';
        return `
            <div class="label">
                <div class="product-name">${product.name}</div>
                <svg id="barcode-${product.id}"></svg>
                <div class="product-price">$${product.price.toFixed(2)}</div>
            </div>
        `;
    }).join('');
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Etiquetas de Códigos de Barras</title>
            <style>
                @page { margin: 0.5cm; }
                body { font-family: sans-serif; margin: 0; }
                .label-container { display: flex; flex-wrap: wrap; }
                .label { 
                    width: ${labelWidth}%; height: ${config.height}; border: 1px dotted #ccc; 
                    padding: 5px; box-sizing: border-box; text-align: center; 
                    display: flex; flex-direction: column; justify-content: space-around;
                    font-size: ${config.fontSize}; overflow: hidden;
                }
                .label svg { width: 100%; height: auto; max-height: 50%; }
                .product-name { font-weight: bold; margin-bottom: 2px; line-height: 1.1; }
                .product-price { font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="label-container">${labelsHTML}</div>
        </body>
        </html>
    `;
}

// Sales Management
window.selectProduct = function() {
    const productId = document.getElementById('saleProduct').value;
    const product = products.find(p => p.id === productId);
    if (product) {
        document.getElementById('salePrice').value = product.price;
        document.getElementById('saleQuantity').value = 1;
        document.getElementById('saleQuantity').max = product.stock;
        updateSaleSubtotal();
    } else {
        document.getElementById('salePrice').value = '';
        document.getElementById('saleQuantity').value = '';
        document.getElementById('saleSubtotal').value = '';
    }
};
window.updateSaleSubtotal = function() {
    const quantity = parseInt(document.getElementById('saleQuantity').value) || 0;
    const price = parseFloat(document.getElementById('salePrice').value) || 0;
    document.getElementById('saleSubtotal').value = (quantity * price).toFixed(2);
};
window.addToSale = function() {
    const productId = document.getElementById('saleProduct').value;
    const quantity = parseInt(document.getElementById('saleQuantity').value);
    const price = parseFloat(document.getElementById('salePrice').value);
    if (!productId || !quantity || !price || quantity <= 0) {
        showAlert('Por favor, complete todos los campos de venta', 'error');
        return;
    }
    const product = products.find(p => p.id === productId);
    if (!product) {
        showAlert('Producto no encontrado', 'error');
        return;
    }
    if (quantity > product.stock) {
        showAlert(`Stock insuficiente. Disponible: ${product.stock}`, 'error');
        return;
    }
    const existingItem = cart.find(item => item.productId === productId);
    if (existingItem) {
        if (existingItem.quantity + quantity > product.stock) {
            showAlert(`Stock insuficiente. Ya tiene ${existingItem.quantity} en el carrito`, 'error');
            return;
        }
        existingItem.quantity += quantity;
        existingItem.subtotal = existingItem.quantity * existingItem.price;
        existingItem.profit = existingItem.quantity * (existingItem.price - existingItem.costPrice);
    } else {
        cart.push({
            productId, productName: product.name, quantity, price, costPrice: product.costPrice,
            subtotal: quantity * price, profit: quantity * (price - product.costPrice)
        });
    }
    updateCartTable();
    clearSaleForm();
    showAlert('Producto agregado al carrito', 'success');
};
window.quickSale = function() {
    addToSale();
    if (cart.length > 0) {
        setTimeout(() => completeSale(), 100);
    }
};
window.removeFromCart = function(index) {
    cart.splice(index, 1);
    updateCartTable();
};

function updateCartTable() {
    const tbody = document.getElementById('cartTableBody');
    const totalElement = document.getElementById('saleTotal');
    const totalCostElement = document.getElementById('totalCost');
    const totalProfitElement = document.getElementById('totalProfit');
    const completeSaleBtn = document.getElementById('completeSaleBtn');
    if (cart.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #666;">Carrito vacío</td></tr>';
        totalElement.textContent = '0.00';
        totalCostElement.textContent = '0.00';
        totalProfitElement.textContent = '0.00';
        completeSaleBtn.disabled = true;
        return;
    }
    const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const totalCost = cart.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0);
    const totalProfit = cart.reduce((sum, item) => sum + item.profit, 0);
    tbody.innerHTML = cart.map((item, index) => `
        <tr>
            <td>${item.productName}</td>
            <td>${item.quantity}</td>
            <td>$${item.price.toFixed(2)}</td>
            <td>$${item.subtotal.toFixed(2)}</td>
            <td class="${item.profit >= 0 ? 'profit-positive' : 'profit-negative'}">$${item.profit.toFixed(2)}</td>
            <td><button class="btn btn-danger btn-small" onclick="removeFromCart(${index})" title="Eliminar">🗑️</button></td>
        </tr>
    `).join('');
    totalElement.textContent = total.toFixed(2);
    totalCostElement.textContent = totalCost.toFixed(2);
    totalProfitElement.textContent = totalProfit.toFixed(2);
    totalProfitElement.className = totalProfit >= 0 ? 'profit-positive' : 'profit-negative';
    completeSaleBtn.disabled = false;
}
window.completeSale = async function() {
    if (cart.length === 0) {
        showAlert('El carrito está vacío', 'error');
        return;
    }
    const customerName = document.getElementById('customerName').value.trim() || 'Cliente Anónimo';
    const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const totalCost = cart.reduce((sum, item) => sum + (item.quantity * item.costPrice), 0);
    const totalProfit = cart.reduce((sum, item) => sum + item.profit, 0);
    const sale = {
        id: Date.now().toString(), customerName, items: [...cart], total, totalCost, totalProfit,
        date: new Date().toISOString(), timestamp: Date.now()
    };
    sales.push(sale);
    cart.forEach(item => {
        const productIndex = products.findIndex(p => p.id === item.productId);
        if (productIndex !== -1) {
            products[productIndex].stock -= item.quantity;
        }
    });
    clearCart();
    updateProductsTable();
    updateSalesHistoryTable();
    updateDashboard();
    document.getElementById('saleBarcodeScanInput').focus();
    await saveToFirebase('sales', sales);
    await saveToFirebase('products', products);
    showAlert(`Venta completada por $${total.toFixed(2)} - Ganancia: $${totalProfit.toFixed(2)}`, 'success');
};
window.clearCart = function() {
    cart = [];
    updateCartTable();
    clearSaleForm();
};

function clearSaleForm() {
    document.getElementById('saleProduct').value = '';
    document.getElementById('saleQuantity').value = '';
    document.getElementById('salePrice').value = '';
    document.getElementById('saleSubtotal').value = '';
    document.getElementById('customerName').value = '';
    document.getElementById('saleBarcodeScanInput').focus();
}

function updateSaleProducts() {
    const select = document.getElementById('saleProduct');
    const currentValue = select.value;
    select.innerHTML = '<option value="">Seleccionar producto...</option>';
    products.filter(p => p.stock > 0).forEach(product => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = `${product.name} - $${product.price.toFixed(2)} (Stock: ${product.stock})`;
        select.appendChild(option);
    });
    if (currentValue && products.find(p => p.id === currentValue && p.stock > 0)) {
        select.value = currentValue;
    }
}

function updateSalesHistoryTable() {
    const tbody = document.getElementById('salesHistoryTableBody');
    if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;">No hay ventas registradas</td></tr>';
        return;
    }
    const sortedSales = [...sales].sort((a, b) => new Date(b.date) - new Date(a.date));
    tbody.innerHTML = sortedSales.slice(0, 50).map(sale => {
        const date = new Date(sale.date).toLocaleString('es-AR');
        const itemsCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
        const profitClass = sale.totalProfit >= 0 ? 'profit-positive' : 'profit-negative';
        return `
            <tr>
                <td>${date}</td>
                <td>${sale.customerName}</td>
                <td>${itemsCount} productos</td>
                <td>$${sale.totalCost.toFixed(2)}</td>
                <td class="${profitClass}">$${sale.totalProfit.toFixed(2)}</td>
                <td><strong>$${sale.total.toFixed(2)}</strong></td>
                <td><button class="btn btn-primary btn-small" onclick="showSaleDetail('${sale.id}')" title="Ver detalle">👁️</button></td>
            </tr>
        `;
    }).join('');
}
window.showSaleDetail = function(saleId) {
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return;
    const modal = document.getElementById('saleDetailModal');
    const content = document.getElementById('saleDetailContent');
    const date = new Date(sale.date).toLocaleString('es-AR');
    content.innerHTML = `
        <p><strong>Fecha:</strong> ${date}</p>
        <p><strong>Cliente:</strong> ${sale.customerName}</p>
        <p><strong>Costo Total:</strong> $${sale.totalCost.toFixed(2)}</p>
        <p class="${sale.totalProfit >= 0 ? 'profit-positive' : 'profit-negative'}"><strong>Ganancia:</strong> $${sale.totalProfit.toFixed(2)}</p>
        <p><strong>Total Venta:</strong> $${sale.total.toFixed(2)}</p>
        <h3>Productos:</h3>
        <table style="width: 100%; margin-top: 10px;">
            <thead><tr style="background: #f7fafc;"><th style="padding: 8px;">Producto</th><th style="padding: 8px;">Cantidad</th><th style="padding: 8px;">P. Costo</th><th style="padding: 8px;">P. Venta</th><th style="padding: 8px;">Ganancia</th><th style="padding: 8px;">Subtotal</th></tr></thead>
            <tbody>
            ${sale.items.map(item => `
                <tr>
                    <td style="padding: 8px;">${item.productName}</td>
                    <td style="padding: 8px;">${item.quantity}</td>
                    <td style="padding: 8px;">$${item.costPrice.toFixed(2)}</td>
                    <td style="padding: 8px;">$${item.price.toFixed(2)}</td>
                    <td style="padding: 8px;" class="${item.profit >= 0 ? 'profit-positive' : 'profit-negative'}">$${item.profit.toFixed(2)}</td>
                    <td style="padding: 8px;">$${item.subtotal.toFixed(2)}</td>
                </tr>
            `).join('')}
            </tbody>
        </table>
    `;
    modal.style.display = 'block';
};
window.closeSaleDetail = function() {
    document.getElementById('saleDetailModal').style.display = 'none';
};

// Dashboard and Reports
function updateDashboard() {
    document.getElementById('totalProducts').textContent = products.length;
    document.getElementById('totalCategories').textContent = categories.length;
    const lowStockItems = products.filter(p => p.stock <= p.minStock);
    document.getElementById('lowStockItems').textContent = lowStockItems.length;
    const today = new Date().toDateString();
    const todaySales = sales.filter(s => new Date(s.date).toDateString() === today);
    document.getElementById('totalSales').textContent = `$${todaySales.reduce((sum, sale) => sum + sale.total, 0).toFixed(2)}`;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlySales = sales.filter(s => {
        const saleDate = new Date(s.date);
        return saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
    });
    const monthlyTotal = monthlySales.reduce((sum, sale) => sum + sale.total, 0);
    const monthlyProfit = monthlySales.reduce((sum, sale) => sum + sale.totalProfit, 0);
    document.getElementById('monthlySales').textContent = `$${monthlyTotal.toFixed(2)}`;
    document.getElementById('monthlyProfit').textContent = `$${monthlyProfit.toFixed(2)}`;
    document.getElementById('monthlyProfit').className = monthlyProfit >= 0 ? 'stat-value profit-positive' : 'stat-value profit-negative';
    updateLowStockTable(lowStockItems);
}

function updateLowStockTable(lowStockItems) {
    const tbody = document.getElementById('lowStockTableBody');
    if (lowStockItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #666;">No hay productos con stock bajo</td></tr>';
        return;
    }
    tbody.innerHTML = lowStockItems.map(product => `
        <tr class="low-stock">
            <td><strong>${product.name}</strong></td>
            <td><span class="category-tag">${product.categoryName}</span></td>
            <td><strong>${product.stock}</strong></td>
            <td>${product.minStock}</td>
            <td style="font-family: monospace; font-size: 12px;">${product.barcode || '-'}</td>
            <td><button class="btn btn-warning btn-small" onclick="editProduct('${product.id}')" title="Reabastecer">📦 Reabastecer</button></td>
        </tr>
    `).join('');
}

function updateReports() {
    const totalSales = sales.reduce((sum, sale) => sum + sale.total, 0);
    const totalProfit = sales.reduce((sum, sale) => sum + sale.totalProfit, 0);
    const totalProductsSold = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
    const avgSale = sales.length > 0 ? totalSales / sales.length : 0;
    const profitMargin = totalSales > 0 ? (totalProfit / totalSales * 100) : 0;
    document.getElementById('reportTotalSales').textContent = `$${totalSales.toFixed(2)}`;
    document.getElementById('reportTotalProfit').textContent = `$${totalProfit.toFixed(2)}`;
    document.getElementById('reportTotalProducts').textContent = totalProductsSold;
    document.getElementById('reportAvgSale').textContent = `$${avgSale.toFixed(2)}`;
    document.getElementById('reportProfitMargin').textContent = `${profitMargin.toFixed(1)}%`;
    const productSales = {};
    sales.forEach(sale => {
        sale.items.forEach(item => {
            if (!productSales[item.productId]) {
                productSales[item.productId] = { name: item.productName, quantity: 0, revenue: 0, cost: 0, profit: 0 };
            }
            productSales[item.productId].quantity += item.quantity;
            productSales[item.productId].revenue += item.subtotal;
            productSales[item.productId].cost += (item.quantity * item.costPrice);
            productSales[item.productId].profit += item.profit;
        });
    });
    const sortedProducts = Object.values(productSales).sort((a, b) => b.quantity - a.quantity);
    document.getElementById('reportTopProduct').textContent = sortedProducts.length > 0 ? sortedProducts[0].name : '-';
    updateTopProductsTable(sortedProducts, totalSales);
    updateCategoryProfitTable();
}

function updateTopProductsTable(sortedProducts, totalSales) {
    const tbody = document.getElementById('topProductsTableBody');
    if (sortedProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;">No hay datos de ventas</td></tr>';
        return;
    }
    tbody.innerHTML = sortedProducts.slice(0, 10).map(product => {
        const percentage = totalSales > 0 ? (product.revenue / totalSales * 100).toFixed(1) : '0';
        const margin = product.revenue > 0 ? (product.profit / product.revenue * 100).toFixed(1) : '0';
        return `
            <tr>
                <td><strong>${product.name}</strong></td><td>${product.quantity}</td><td>$${product.cost.toFixed(2)}</td>
                <td>$${product.revenue.toFixed(2)}</td><td class="${product.profit >= 0 ? 'profit-positive' : 'profit-negative'}">$${product.profit.toFixed(2)}</td>
                <td>${margin}%</td><td>${percentage}%</td>
            </tr>
        `;
    }).join('');
}

function updateCategoryProfitTable() {
    const tbody = document.getElementById('categoryProfitTableBody');
    const categoryProfits = {};
    sales.forEach(sale => {
        sale.items.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            const categoryName = product ? product.categoryName : 'Sin categoría';
            if (!categoryProfits[categoryName]) {
                categoryProfits[categoryName] = { quantity: 0, revenue: 0, cost: 0, profit: 0 };
            }
            categoryProfits[categoryName].quantity += item.quantity;
            categoryProfits[categoryName].revenue += item.subtotal;
            categoryProfits[categoryName].cost += (item.quantity * item.costPrice);
            categoryProfits[categoryName].profit += item.profit;
        });
    });
    const sortedCategories = Object.entries(categoryProfits).sort(([, a], [, b]) => b.profit - a.profit);
    if (sortedCategories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #666;">No hay datos de ventas</td></tr>';
        return;
    }
    tbody.innerHTML = sortedCategories.map(([categoryName, data]) => {
        const margin = data.revenue > 0 ? (data.profit / data.revenue * 100).toFixed(1) : '0';
        return `
            <tr>
                <td><span class="category-tag">${categoryName}</span></td><td>${data.quantity}</td>
                <td>$${data.cost.toFixed(2)}</td><td>$${data.revenue.toFixed(2)}</td>
                <td class="${data.profit >= 0 ? 'profit-positive' : 'profit-negative'}">$${data.profit.toFixed(2)}</td>
                <td>${margin}%</td>
            </tr>
        `;
    }).join('');
}

// Settings and Data Management
function loadBusinessInfo() {
    document.getElementById('businessName').value = localStorage.getItem('businessName') || '';
    document.getElementById('businessAddress').value = localStorage.getItem('businessAddress') || '';
    document.getElementById('businessPhone').value = localStorage.getItem('businessPhone') || '';
    document.getElementById('businessEmail').value = localStorage.getItem('businessEmail') || '';
    document.getElementById('backupInterval').value = localStorage.getItem('backupInterval') || '12';
}
window.saveBusinessInfo = function() {
    localStorage.setItem('businessName', document.getElementById('businessName').value);
    localStorage.setItem('businessAddress', document.getElementById('businessAddress').value);
    localStorage.setItem('businessPhone', document.getElementById('businessPhone').value);
    localStorage.setItem('businessEmail', document.getElementById('businessEmail').value);
    showAlert('Información del negocio guardada correctamente', 'success');
};

function updateAllData() {
    updateCategoriesTable();
    updateProductsTable();
    updateProductCategories();
    updateSaleProducts();
    updateSalesHistoryTable();
    updateDashboard();
    updateReports();
}

function downloadJSON(data, filename) {
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function downloadCSV(csvContent, filename) {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert('Archivo CSV exportado correctamente', 'success');
}

window.exportMssBiJson = function() {
    const businessName = localStorage.getItem('businessName') || 'Nombre no configurado';
    const productsData = products.map(p => ({
        nombre: p.name,
        precio_costo: p.costPrice,
        precio_venta: p.price
    }));
    const salesData = [];
    sales.forEach(sale => {
        sale.items.forEach(item => {
            salesData.push({
                fecha: new Date(sale.date).toISOString().split('T')[0],
                producto: item.productName,
                cantidad: item.quantity
            });
        });
    });
    const mssBiData = { negocio: businessName, productos: productsData, ventas: salesData };
    downloadJSON(mssBiData, 'MSS_BI_export.json');
    showAlert('Exportación para MSS BI generada con éxito.', 'success');
};

window.exportData = function() {
    const data = {
        categories, products, sales,
        exportDate: new Date().toISOString(),
        businessInfo: {
            name: localStorage.getItem('businessName'),
            address: localStorage.getItem('businessAddress'),
            phone: localStorage.getItem('businessPhone'),
            email: localStorage.getItem('businessEmail')
        }
    };
    downloadJSON(data, `backup_completo_${new Date().toISOString().split('T')[0]}.json`);
    showAlert('Datos exportados correctamente', 'success');
};

window.importData = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async function(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!confirm('¿Está seguro de que desea importar estos datos? Esto reemplazará todos los datos actuales.')) return;
                    showLoading(true);
                    if (data.categories) categories = data.categories;
                    if (data.products) products = data.products;
                    if (data.sales) sales = data.sales;
                    if (data.businessInfo) {
                        localStorage.setItem('businessName', data.businessInfo.name || '');
                        localStorage.setItem('businessAddress', data.businessInfo.address || '');
                        localStorage.setItem('businessPhone', data.businessInfo.phone || '');
                        localStorage.setItem('businessEmail', data.businessInfo.email || '');
                    }
                    await saveAllData();
                    updateAllData();
                    showAlert('Datos importados correctamente', 'success');
                } catch (error) {
                    showAlert('Error al leer el archivo: formato inválido', 'error');
                } finally {
                    showLoading(false);
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
};

function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(alertDiv, container.firstChild);
    } else {
        document.body.appendChild(alertDiv);
    }
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 4000);
}

window.onclick = function(event) {
    const modals = ['saleDetailModal', 'priceUpdateModal', 'barcodeLabelsModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
};

// Exponer funciones al objeto window para que sean accesibles desde el HTML
Object.assign(window, {
    showSection, addCategory, updateCategory, editCategory, deleteCategory, clearCategoryForm, searchCategories,
    addProduct, updateProduct, editProduct, deleteProduct, clearProductForm, searchProducts, selectProduct,
    updateSaleSubtotal, addToSale, quickSale, removeFromCart, completeSale, clearCart, showSaleDetail,
    closeSaleDetail, exportData, importData, manualBackup, restoreFromFirebase, saveBusinessInfo,
    saveBackupSettings, showPriceUpdateModal, closePriceUpdateModal, previewPriceUpdate, applyPriceUpdate,
    showBarcodeLabelsModal, closeBarcodeLabelsModal, generateBarcodeLabels, toggleAuthMode, resetPassword,
    logout, exportMssBiJson, exportCategoriesCSV, exportProductsCSV, exportSalesCSV, exportReportsCSV
});