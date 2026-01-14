import { useState, useRef, useEffect } from 'react';
import { Search, Trash2, ShoppingCart, User, Building, Users } from 'lucide-react';
import apiClient from '../api/client';
import './POS.css';

interface Product {
    id: number;
    barcode: string;
    nameEn: string;
    nameAr?: string;
    code?: string;
    priceRetail: number;
    priceWholesale?: number;
    taxRate?: number;
    cost: number;
    stock?: number;
}

interface Customer {
    id: number;
    name: string;
    type: 'RETAIL' | 'WHOLESALE';
}

interface CartItem extends Product {
    qty: number;
    discount?: number;
    price: number;
    lineTotal: number;
    priceType?: 'RETAIL' | 'WHOLESALE' | 'CUSTOM';
    customPrice?: number;
}

interface PlatformConfig {
    id: string;
    code: string;
    name: string;
    icon: string;
    tax: number;
    platform: number;
    shippingFee: number;
    btnText: string;
    active: boolean;
}

function POS() {
    const [barcode, setBarcode] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [paymentMethod, setPaymentMethod] = useState('CASH');
    const [showProductBrowser, setShowProductBrowser] = useState(false);
    const [browserProducts, setBrowserProducts] = useState<Product[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [categories, setCategories] = useState<any[]>([]);
    const [editingPrice, setEditingPrice] = useState<{
        productId: number;
        currentPrice: number;
        cost: number;
    } | null>(null);

    // Payment tracking states
    const [paymentType, setPaymentType] = useState<'FULL' | 'PARTIAL' | 'CREDIT'>('FULL');
    const [paidAmount, setPaidAmount] = useState<number>(0);
    const [deliveredNow, setDeliveredNow] = useState<boolean>(true);

    // ✅ NEW: Create customer states
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({
        name: '',
        phone: '',
        type: 'RETAIL' as 'RETAIL' | 'WHOLESALE'
    });

    const PAYMENT_METHODS = [
        { id: 'CASH', name: 'نقدي', icon: '💵' },
        { id: 'CARD', name: 'بطاقة', icon: '💳' },
        { id: 'INSTAPAY', name: 'InstaPay', icon: '📱' },
        { id: 'FAWRY', name: 'فوري', icon: '🏪' },
        { id: 'WALLET', name: 'محفظة', icon: '👛' },
    ];

    const [CHANNELS, setChannels] = useState<Record<string, PlatformConfig>>({});
    const [activeTab, setActiveTab] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [discountValue, setDiscountValue] = useState<number>(0);
    const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
    const [message, setMessage] = useState('');
    const barcodeInputRef = useRef<HTMLInputElement>(null);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const user = JSON.parse(localStorage.getItem('user')!);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customersList, setCustomersList] = useState<Customer[]>([]);

    // Auto-update paid amount when payment type or total changes
    useEffect(() => {
        const totals = calculateTotals();
        if (paymentType === 'FULL') {
            setPaidAmount(totals.finalTotal);
            setDeliveredNow(true);
        } else if (paymentType === 'CREDIT') {
            setPaidAmount(0);
            setDeliveredNow(true); // ✅ Changed to true so stock is deducted immediately
        }
    }, [paymentType, cart, appliedDiscount, activeTab]);

    // ✅ NEW: Auto-reset payment type to FULL when no customer selected (Cash Customer)
    useEffect(() => {
        if (!selectedCustomer) {
            setPaymentType('FULL');
        }
    }, [selectedCustomer]);

    const togglePriceType = (productId: number, newType: 'RETAIL' | 'WHOLESALE') => {
        setCart(cart.map(item => {
            if (item.id === productId) {
                let newPrice = newType === 'RETAIL' ? Number(item.priceRetail) : Number(item.priceWholesale || item.priceRetail);
                return {
                    ...item,
                    priceType: newType,
                    price: newPrice,
                    lineTotal: newPrice * item.qty,
                    customPrice: undefined
                };
            }
            return item;
        }));
    };

    const updateCustomPrice = (productId: number, newPrice: number) => {
        const item = cart.find(i => i.id === productId);
        if (!item) return;

        if (newPrice < Number(item.cost)) {
            playBeep('error');
            setMessage('⚠️ يجب أن يكون السعر أعلى من الحد الأدنى المسموح به');
            return;
        }

        setCart(cart.map(i => {
            if (i.id === productId) {
                return {
                    ...i,
                    price: newPrice,
                    priceType: 'CUSTOM',
                    customPrice: newPrice,
                    lineTotal: newPrice * i.qty
                };
            }
            return i;
        }));
        setEditingPrice(null);
        setMessage(`✅ تم تعديل السعر إلى ${newPrice.toFixed(2)} ر.س`);
    };

    const loadCategories = async () => {
        try {
            const data = await apiClient.get('/products/categories');
            setCategories(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Failed to load categories', e);
            setCategories([]);
        }
    };

    const loadProductsForBrowser = async (categoryId?: string) => {
        try {
            const branchId = user.branchId || user.branch?.id || 1;
            const url = categoryId
                ? `/products?branchId=${branchId}&categoryId=${categoryId}&active=true`
                : `/products?branchId=${branchId}&active=true`;
            const response = await apiClient.get(url);
            const products = (response.data || response).map((p: any) => ({
                ...p,
                priceRetail: Number(p.priceRetail) || 0,
                priceWholesale: p.priceWholesale ? Number(p.priceWholesale) : undefined,
                cost: Number(p.cost) || 0,
            }));
            setBrowserProducts(products);
        } catch (e) {
            console.error('Failed to load products', e);
            setBrowserProducts([]);
        }
    };

    useEffect(() => {
        if (showProductBrowser) {
            loadCategories();
            loadProductsForBrowser();
        }
    }, [showProductBrowser]);

    const loadPlatformSettings = async () => {
        try {
            setLoading(true);
            const data = await apiClient.get('/settings/platforms');
            if (!data || !Array.isArray(data) || data.length === 0) {
                setMessage('⚠️ يرجى إضافة منصات من صفحة الإعدادات');
                setLoading(false);
                return;
            }

            const loadedChannels: Record<string, PlatformConfig> = {};
            data.forEach((platform: any) => {
                if (platform.active) {
                    loadedChannels[platform.id.toString()] = {
                        id: platform.id.toString(),
                        code: platform.platform,
                        name: platform.name,
                        icon: platform.icon || '🛒',
                        tax: Number(platform.taxRate) / 100,
                        platform: Number(platform.commission) / 100,
                        shippingFee: Number(platform.shippingFee) || 0,
                        btnText: platform.name,
                        active: platform.active,
                    };
                }
            });

            setChannels(loadedChannels);
            const firstChannel = Object.keys(loadedChannels)[0];
            if (firstChannel) setActiveTab(firstChannel);
            setLoading(false);
        } catch (error) {
            console.error('Failed to load platforms', error);
            setMessage('⚠️ يرجى إضافة منصات من صفحة الإعدادات');
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPlatformSettings();
    }, []);

    useEffect(() => {
        barcodeInputRef.current?.focus();
    }, [cart]);

    useEffect(() => {
        if (!showSearch && !showCustomerModal && barcodeInputRef.current) {
            barcodeInputRef.current.focus();
        }
    }, [showSearch, showCustomerModal]);

    useEffect(() => {
        if (showCustomerModal) {
            apiClient.get('/customers').then(data => setCustomersList(data.data || []));
        }
    }, [showCustomerModal]);

    useEffect(() => {
        if (cart.length > 0) {
            const newCart = cart.map(item => {
                if (item.priceType === 'CUSTOM' && item.customPrice !== undefined) {
                    return item;
                }

                let price = Number(item.priceRetail);
                let priceType: 'RETAIL' | 'WHOLESALE' = 'RETAIL';

                if (selectedCustomer?.type === 'WHOLESALE' && item.priceWholesale) {
                    price = Number(item.priceWholesale);
                    priceType = 'WHOLESALE';
                }

                return {
                    ...item,
                    price,
                    priceType,
                    lineTotal: price * item.qty,
                    customPrice: undefined
                };
            });
            setCart(newCart);
        }
    }, [selectedCustomer]);

    const playBeep = (type: 'success' | 'error') => {
        const audio = new Audio(
            type === 'success'
                ? 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj2LDciUFLIHO8tiJNwgZaLvt459NEAxQpPwtmMcBjiR1LMeSwFJHfH8N2QQAoUXrTp66hVFApGnDyvmwhBjuO1OKczs='
                : 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
        );
        audio.play().catch(() => { });
    };

    const handleBarcodeSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!barcode.trim()) return;

        setLoading(true);
        setMessage('');
        try {
            const branchId = user.branchId || user.branch?.id || 1;
            const data = await apiClient.get(`/products/find?barcode=${barcode}&branchId=${branchId}`);
            addToCart(data);
            setMessage(`✅ ${data.nameAr || data.nameEn}`);
            setBarcode('');
        } catch (err: any) {
            playBeep('error');
            setMessage(err.response?.data?.message || '❌ المنتج غير موجود');
            setBarcode('');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }
        try {
            const branchId = user.branchId || user.branch?.id || 1;
            const data = await apiClient.get(`/products?search=${query}&branchId=${branchId}`);
            setSearchResults(Array.isArray(data) ? data : data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    const addToCart = (product: Product) => {
        const availableStock = product.stock !== undefined ? product.stock : Infinity;
        if (availableStock <= 0) {
            playBeep('error');
            setMessage('❌ المنتج غير متوفر في المخزون');
            return;
        }

        let appliedPrice = Number(product.priceRetail);
        let priceType: 'RETAIL' | 'WHOLESALE' = 'RETAIL';

        if (selectedCustomer?.type === 'WHOLESALE' && product.priceWholesale) {
            appliedPrice = Number(product.priceWholesale);
            priceType = 'WHOLESALE';
        }

        const existingItem = cart.find(item => item.id === product.id);
        if (existingItem) {
            const newQty = existingItem.qty + 1;
            if (newQty > availableStock) {
                playBeep('error');
                setMessage(`⚠️ الكمية المتاحة: ${availableStock}`);
                return;
            }
            setCart(cart.map(item =>
                item.id === product.id
                    ? { ...item, qty: newQty, lineTotal: newQty * item.price }
                    : item
            ));
        } else {
            setCart([
                ...cart,
                {
                    ...product,
                    price: appliedPrice,
                    priceType: priceType,
                    qty: 1,
                    lineTotal: appliedPrice,
                }
            ]);
        }

        playBeep('success');
        setShowSearch(false);
        setSearchQuery('');
        setSearchResults([]);
    };

    const updateQty = (productId: number, newQty: number) => {
        if (newQty <= 0) {
            setCart(cart.filter(item => item.id !== productId));
            return;
        }

        const cartItem = cart.find(item => item.id === productId);
        if (!cartItem) return;

        const availableStock = cartItem.stock !== undefined ? cartItem.stock : Infinity;
        if (newQty > availableStock) {
            playBeep('error');
            setMessage(`⚠️ الكمية المتاحة: ${availableStock}`);
            return;
        }

        setCart(cart.map(item =>
            item.id === productId
                ? { ...item, qty: newQty, lineTotal: newQty * item.price }
                : item
        ));
    };

    const calculateTotals = () => {
        if (!CHANNELS[activeTab]) {
            return {
                subtotal: 0,
                subtotalAfterDiscount: 0,
                discountAmount: 0,
                taxAmount: 0,
                platformAmount: 0,
                shippingFee: 0,
                finalTotal: 0
            };
        }

        const config = CHANNELS[activeTab];
        const subtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
        const discountAmount = (subtotal * appliedDiscount) / 100;
        const subtotalAfterDiscount = subtotal - discountAmount;
        const taxAmount = subtotalAfterDiscount * config.tax;
        const platformAmount = subtotalAfterDiscount * config.platform;
        const shippingFee = config.shippingFee;
        const finalTotal = subtotalAfterDiscount + taxAmount + shippingFee;

        return {
            subtotal,
            subtotalAfterDiscount,
            discountAmount,
            taxAmount,
            platformAmount,
            shippingFee,
            finalTotal
        };
    };

    const handleApplyDiscount = () => {
        setAppliedDiscount(discountValue);
        setMessage(`✅ تم تطبيق خصم ${discountValue}%`);
    };

    const handleCheckout = async () => {
        if (cart.length === 0) {
            setMessage('❌ السلة فارغة');
            return;
        }

        if (!CHANNELS[activeTab]) {
            setMessage('❌ يرجى اختيار منصة');
            return;
        }

        // ✅ NEW: Validate payment type for cash-only customers
        if (!selectedCustomer && (paymentType === 'PARTIAL' || paymentType === 'CREDIT')) {
            setMessage('❌ العميل النقدي لا يمكنه الدفع آجل أو جزئي');
            playBeep('error');
            return;
        }

        setLoading(true);
        try {
            const totals = calculateTotals();
            const config = CHANNELS[activeTab];
            const paymentMethodName = PAYMENT_METHODS.find(p => p.id === paymentMethod)?.name;

            let actualPaidAmount = 0;
            if (paymentType === 'FULL') {
                actualPaidAmount = totals.finalTotal;
            } else if (paymentType === 'PARTIAL') {
                actualPaidAmount = paidAmount;
            } else if (paymentType === 'CREDIT') {
                actualPaidAmount = 0;
            }

            const saleData = {
                branchId: user.branchId || user.branch?.id || 1,
                channel: CHANNELS[activeTab].code,
                customerId: selectedCustomer?.id || null,
                lines: cart.map(item => ({
                    productId: item.id,
                    qty: item.qty,
                    unitPrice: parseFloat(item.price.toFixed(2)),
                    taxRate: parseFloat((config.tax * 100).toFixed(2)),
                    lineDiscount: 0
                })),
                paymentMethod: paymentMethod,
                totalDiscount: parseFloat(totals.discountAmount.toFixed(2)),
                platformCommission: parseFloat(totals.platformAmount.toFixed(2)),
                shippingFee: parseFloat(totals.shippingFee.toFixed(2)),
                notes: `${config.name} - ${paymentMethodName}`,
                paidAmount: actualPaidAmount,
                delivered: deliveredNow,
            };

            console.log('🔹 Sale Data:', saleData);

            const response = await apiClient.post('/pos/sales', saleData);

            playBeep('success');
            setMessage(`✅ تم إتمام العملية! رقم الفاتورة: ${response.invoiceNo}`);

            // Reset
            setCart([]);
            setPaymentMethod('CASH');
            setShowCustomerModal(false);
            setSelectedCustomer(null);
            setDiscountValue(0);
            setAppliedDiscount(0);
            setPaymentType('FULL');
            setPaidAmount(0);
            setDeliveredNow(true);
        } catch (error: any) {
            console.error(error);
            playBeep('error');
            setMessage(error.response?.data?.message || '❌ فشل إتمام العملية');
        } finally {
            setLoading(false);
        }
    };

    // ✅ NEW: Create customer handler
    const handleCreateCustomer = async () => {
        if (!newCustomer.name.trim()) {
            setMessage('❌ يرجى إدخال اسم العميل');
            playBeep('error');
            return;
        }

        try {
            const response = await apiClient.post('/customers', newCustomer);
            playBeep('success');
            setMessage(`✅ تم إضافة العميل: ${newCustomer.name}`);
            setSelectedCustomer(response);
            setShowCreateCustomer(false);
            setNewCustomer({ name: '', phone: '', type: 'RETAIL' });
            setShowCustomerModal(false);
            // Reload customers list
            apiClient.get('/customers').then(data => setCustomersList(data.data || []));
        } catch (error: any) {
            playBeep('error');
            setMessage(error.response?.data?.message || '❌ فشل إضافة العميل');
        }
    };

    const handleLogout = () => {
        localStorage.clear();
        window.location.reload();
    };

    const refreshPlatformSettings = async () => {
        await loadPlatformSettings();
        setMessage('✅ تم تحديث المنصات');
    };

    if (loading && Object.keys(CHANNELS).length === 0) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
                <div style={{ fontSize: '18px', color: '#64748b' }}>جاري التحميل...</div>
            </div>
        );
    }

    if (Object.keys(CHANNELS).length === 0) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>⚠️</div>
                <h2 style={{ fontSize: '24px', marginBottom: '16px' }}>لا توجد منصات نشطة</h2>
                <p style={{ color: '#64748b', marginBottom: '24px' }}>يرجى إضافة منصات من صفحة الإعدادات</p>
                <button
                    onClick={() => (window.location.href = '/settings')}
                    style={{
                        padding: '12px 24px',
                        background: '#6366f1',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '16px'
                    }}
                >
                    الذهاب للإعدادات
                </button>
            </div>
        );
    }

    const totals = calculateTotals();

    return (
        <div className="pos-container" dir="rtl">
            {/* Header */}
            <div className="pos-header">
                <div className="header-top">
                    <h1><ShoppingCart size={32} /> نقطة البيع</h1>
                    <div className="user-info">
                        <div className="user-tag"><User size={14} /> {user.fullName}</div>
                        <div className="branch-tag"><Building size={14} /> {user.branch?.name}</div>
                        <button onClick={handleLogout} className="logout-btn">تسجيل خروج</button>
                        <button
                            onClick={refreshPlatformSettings}
                            className="btn-secondary"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                                transition: 'all 0.2s'
                            }}
                            title="تحديث المنصات"
                        >
                            🔄
                        </button>
                    </div>
                </div>

                {/* Platform Tabs */}
                <div className="channel-tabs">
                    {Object.values(CHANNELS).map(channel => (
                        <button
                            key={channel.id}
                            className={`tab-btn ${activeTab === channel.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(channel.id)}
                        >
                            {channel.name}
                        </button>
                    ))}
                </div>

                {/* Channel Info Bar */}
                {CHANNELS[activeTab] && (
                    <div className="channel-info-bar">
                        <div
                            className="info-item"
                            onClick={() => setShowCustomerModal(true)}
                            style={{
                                cursor: 'pointer',
                                background: selectedCustomer ? '#dbeafe' : 'transparent',
                                padding: '5px 10px',
                                borderRadius: '6px'
                            }}
                        >
                            <span className="info-label"><Users size={16} /></span>
                            <span className="info-value" style={{ marginRight: '5px', fontWeight: 'bold' }}>
                                {selectedCustomer ? selectedCustomer.name : 'عميل نقدي (Retail)'}
                            </span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">المنصة:</span>
                            <span className="info-value">{CHANNELS[activeTab].name}</span>
                        </div>
                        <div className="info-item">
                            <span className="info-label">الضريبة:</span>
                            <span className="info-value">{(CHANNELS[activeTab].tax * 100).toFixed(0)}%</span>
                        </div>
                        {CHANNELS[activeTab].platform > 0 && (
                            <div className="info-item">
                                <span className="info-label">العمولة:</span>
                                <span className="info-value">{(CHANNELS[activeTab].platform * 100).toFixed(0)}%</span>
                            </div>
                        )}
                        {CHANNELS[activeTab].shippingFee > 0 && (
                            <div className="info-item">
                                <span className="info-label">الشحن:</span>
                                <span className="info-value">{CHANNELS[activeTab].shippingFee.toFixed(2)} ر.س</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="pos-main">
                {/* Scanner Section */}
                <div className="scanner-section">
                    <h2 className="section-title">مسح الباركود</h2>
                    <form onSubmit={handleBarcodeSubmit}>
                        <div className="barcode-wrapper">
                            <input
                                ref={barcodeInputRef}
                                type="text"
                                value={barcode}
                                onChange={(e) => setBarcode(e.target.value)}
                                placeholder="امسح الباركود أو أدخله يدوياً..."
                                className="barcode-input"
                                disabled={loading}
                                dir="ltr"
                            />
                        </div>
                    </form>

                    {message && (
                        <div className={`message ${message.startsWith('✅') ? 'success' : 'error'}`}>
                            {message}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                        <button
                            onClick={() => setShowSearch(true)}
                            style={{
                                flex: 1,
                                padding: '12px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                fontSize: '14px',
                                fontWeight: '500'
                            }}
                        >
                            <Search size={18} />
                            بحث عن منتج
                        </button>
                        <button
                            onClick={() => setShowProductBrowser(true)}
                            style={{
                                flex: 1,
                                padding: '12px',
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                fontSize: '14px',
                                fontWeight: '500'
                            }}
                        >
                            <ShoppingCart size={18} />
                            تصفح المنتجات
                        </button>
                        <button
                            onClick={() => setCart([])}
                            style={{
                                padding: '12px 20px',
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>

                    {/* Discount Card */}
                    <div className="discount-card">
                        <h3>الخصم (%)</h3>
                        <div className="discount-group">
                            <input
                                type="number"
                                placeholder="0"
                                value={discountValue || ''}
                                onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                className="discount-field"
                            />
                            <button className="apply-btn" onClick={handleApplyDiscount}>تطبيق</button>
                        </div>
                    </div>
                </div>

                {/* Cart Section */}
                <div className="cart-section">
                    <div className="cart-header">
                        <h2 className="cart-title">السلة ({cart.length})</h2>
                    </div>

                    {cart.length === 0 ? (
                        <div className="empty-cart" style={{ textAlign: 'center', padding: '100px 0', opacity: 0.5 }}>
                            <ShoppingCart size={80} style={{ marginBottom: '20px' }} />
                            <p>السلة بانتظار أول منتج...</p>
                        </div>
                    ) : (
                        <div className="cart-items-list">
                            {cart.map(item => (
                                <div
                                    key={item.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '16px',
                                        padding: '16px',
                                        background: 'white',
                                        borderRadius: '12px',
                                        marginBottom: '12px',
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {/* Product Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <strong style={{ display: 'block', marginBottom: '6px', fontSize: '15px', color: '#1e293b' }}>
                                            {item.nameAr || item.nameEn}
                                        </strong>
                                        <small style={{ color: '#64748b', display: 'block', marginBottom: '10px', fontSize: '13px' }}>
                                            {item.barcode} • {item.price.toFixed(2)} ر.س
                                        </small>

                                        {item.stock !== undefined && (
                                            <small style={{
                                                color: item.stock <= 10 ? '#f59e0b' : '#10b981',
                                                fontWeight: 600,
                                                fontSize: '12px',
                                                display: 'block',
                                                marginBottom: '10px'
                                            }}>
                                                المخزون: {item.stock}
                                            </small>
                                        )}

                                        {/* Price Type Selector */}
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <div style={{
                                                display: 'inline-flex',
                                                background: '#f1f5f9',
                                                padding: '3px',
                                                borderRadius: '8px',
                                                gap: '3px'
                                            }}>
                                                {/* Retail Button */}
                                                <label style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '6px 14px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    fontSize: '13px',
                                                    fontWeight: '500',
                                                    background: item.priceType === 'RETAIL' ? '#3b82f6' : 'transparent',
                                                    color: item.priceType === 'RETAIL' ? 'white' : '#64748b',
                                                    transition: 'all 0.2s'
                                                }}>
                                                    <input
                                                        type="radio"
                                                        checked={item.priceType === 'RETAIL'}
                                                        onChange={() => togglePriceType(item.id, 'RETAIL')}
                                                        style={{ display: 'none' }}
                                                    />
                                                    <span>قطاعي</span> {Number(item.priceRetail).toFixed(2)}
                                                </label>

                                                {/* Wholesale Button */}
                                                {item.priceWholesale && (
                                                    <label style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '6px 14px',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontSize: '13px',
                                                        fontWeight: '500',
                                                        background: item.priceType === 'WHOLESALE' ? '#3b82f6' : 'transparent',
                                                        color: item.priceType === 'WHOLESALE' ? 'white' : '#64748b',
                                                        transition: 'all 0.2s'
                                                    }}>
                                                        <input
                                                            type="radio"
                                                            checked={item.priceType === 'WHOLESALE'}
                                                            onChange={() => togglePriceType(item.id, 'WHOLESALE')}
                                                            style={{ display: 'none' }}
                                                        />
                                                        <span>جملة</span> {Number(item.priceWholesale).toFixed(2)}
                                                    </label>
                                                )}
                                            </div>

                                            {/* Custom Price Button */}
                                            <button
                                                onClick={() => setEditingPrice({
                                                    productId: item.id,
                                                    currentPrice: item.price,
                                                    cost: Number(item.cost)
                                                })}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '6px 14px',
                                                    background: item.priceType === 'CUSTOM'
                                                        ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                                                        : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    fontSize: '13px',
                                                    cursor: 'pointer',
                                                    fontWeight: '500',
                                                    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.3)';
                                                }}
                                            >
                                                {item.priceType === 'CUSTOM' ? '✏️ تعديل السعر' : '💰 سعر مخصص'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Quantity Controls */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        background: '#f8fafc',
                                        padding: '6px',
                                        borderRadius: '12px',
                                        border: '2px solid #e2e8f0',
                                        flexShrink: 0
                                    }}>
                                        <button
                                            onClick={() => updateQty(item.id, item.qty - 1)}
                                            style={{
                                                width: '36px',
                                                height: '36px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '10px',
                                                cursor: 'pointer',
                                                fontSize: '20px',
                                                fontWeight: '700',
                                                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
                                                transition: 'all 0.2s',
                                                lineHeight: '1'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'scale(1.1)';
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'scale(1)';
                                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.3)';
                                            }}
                                        >
                                            −
                                        </button>
                                        <span style={{
                                            minWidth: '45px',
                                            textAlign: 'center',
                                            fontSize: '18px',
                                            fontWeight: '700',
                                            color: '#1e293b',
                                            padding: '0 8px'
                                        }}>
                                            {item.qty}
                                        </span>
                                        <button
                                            onClick={() => updateQty(item.id, item.qty + 1)}
                                            style={{
                                                width: '36px',
                                                height: '36px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '10px',
                                                cursor: 'pointer',
                                                fontSize: '20px',
                                                fontWeight: '700',
                                                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                                transition: 'all 0.2s',
                                                lineHeight: '1'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'scale(1.1)';
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'scale(1)';
                                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
                                            }}
                                        >
                                            +
                                        </button>
                                    </div>

                                    {/* Line Total */}
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-end',
                                        justifyContent: 'center',
                                        minWidth: '100px',
                                        flexShrink: 0
                                    }}>
                                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#10b981', lineHeight: '1.2', marginBottom: '4px' }}>
                                            {item.lineTotal.toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                                            ر.س
                                        </div>
                                    </div>

                                    {/* Delete Button */}
                                    <button
                                        onClick={() => updateQty(item.id, 0)}
                                        style={{
                                            width: '40px',
                                            height: '40px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: '#fee2e2',
                                            color: '#ef4444',
                                            border: 'none',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            flexShrink: 0,
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#ef4444';
                                            e.currentTarget.style.color = 'white';
                                            e.currentTarget.style.transform = 'scale(1.05)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = '#fee2e2';
                                            e.currentTarget.style.color = '#ef4444';
                                            e.currentTarget.style.transform = 'scale(1)';
                                        }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ✅ NEW: Detailed Totals Breakdown */}
                    {cart.length > 0 && (
                        <div style={{
                            background: 'white',
                            borderRadius: '12px',
                            padding: '16px',
                            marginBottom: '16px',
                            border: '1px solid #e5e7eb'
                        }}>
                            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#1e293b' }}>
                                💰 تفاصيل المبلغ
                            </h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {/* Subtotal */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                    <span style={{ color: '#64748b' }}>المجموع الفرعي:</span>
                                    <span style={{ fontWeight: '600' }}>{totals.subtotal.toFixed(2)} ر.س</span>
                                </div>

                                {/* Discount */}
                                {totals.discountAmount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                        <span style={{ color: '#64748b' }}>الخصم ({appliedDiscount}%):</span>
                                        <span style={{ fontWeight: '600', color: '#ef4444' }}>- {totals.discountAmount.toFixed(2)} ر.س</span>
                                    </div>
                                )}

                                {/* Subtotal After Discount */}
                                {totals.discountAmount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px dashed #e5e7eb', paddingTop: '8px' }}>
                                        <span style={{ color: '#64748b' }}>المجموع بعد الخصم:</span>
                                        <span style={{ fontWeight: '600' }}>{totals.subtotalAfterDiscount.toFixed(2)} ر.س</span>
                                    </div>
                                )}

                                {/* Tax */}
                                {totals.taxAmount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                        <span style={{ color: '#64748b' }}>الضريبة ({(CHANNELS[activeTab].tax * 100).toFixed(0)}%):</span>
                                        <span style={{ fontWeight: '600', color: '#10b981' }}>+ {totals.taxAmount.toFixed(2)} ر.س</span>
                                    </div>
                                )}

                                {/* Shipping Fee */}
                                {totals.shippingFee > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                                        <span style={{ color: '#64748b' }}>رسوم الشحن:</span>
                                        <span style={{ fontWeight: '600', color: '#f59e0b' }}>+ {totals.shippingFee.toFixed(2)} ر.س</span>
                                    </div>
                                )}

                                {/* Final Total */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    padding: '12px 0',
                                    borderTop: '2px solid #1e293b',
                                    marginTop: '8px'
                                }}>
                                    <span style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>الإجمالي النهائي:</span>
                                    <span style={{ fontSize: '22px', fontWeight: '800', color: '#10b981' }}>{totals.finalTotal.toFixed(2)} ر.س</span>
                                </div>

                                {/* Payment Summary */}
                                {paymentType === 'PARTIAL' && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#dbeafe', borderRadius: '8px', marginTop: '8px' }}>
                                            <span style={{ fontWeight: '600', color: '#1e40af' }}>المبلغ المدفوع الآن:</span>
                                            <span style={{ fontWeight: '700', color: '#1e40af' }}>{paidAmount.toFixed(2)} ر.س</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#fee2e2', borderRadius: '8px' }}>
                                            <span style={{ fontWeight: '600', color: '#991b1b' }}>المبلغ المتبقي:</span>
                                            <span style={{ fontWeight: '700', color: '#991b1b' }}>{(totals.finalTotal - paidAmount).toFixed(2)} ر.س</span>
                                        </div>
                                    </>
                                )}

                                {paymentType === 'CREDIT' && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: '#fee2e2', borderRadius: '8px', marginTop: '8px' }}>
                                        <span style={{ fontWeight: '600', color: '#991b1b' }}>كامل المبلغ آجل:</span>
                                        <span style={{ fontWeight: '700', color: '#991b1b' }}>{totals.finalTotal.toFixed(2)} ر.س</span>
                                    </div>
                                )}

                                {/* Platform Commission */}
                                {totals.platformAmount > 0 && (
                                    <div style={{
                                        padding: '8px',
                                        background: '#fef3c7',
                                        borderRadius: '8px',
                                        marginTop: '8px',
                                        fontSize: '12px',
                                        color: '#92400e'
                                    }}>
                                        ℹ️ عمولة المنصة ({(CHANNELS[activeTab].platform * 100).toFixed(0)}%): {totals.platformAmount.toFixed(2)} ر.س (للمعلومات فقط)
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Payment Type Selection */}
                    {cart.length > 0 && (
                        <div style={{ marginBottom: '16px', marginTop: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>
                                نوع الدفع
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPaymentType('FULL');
                                        setPaidAmount(totals.finalTotal);
                                        setDeliveredNow(true);
                                    }}
                                    style={{
                                        padding: '12px',
                                        background: paymentType === 'FULL' ? '#10b981' : 'white',
                                        color: paymentType === 'FULL' ? 'white' : '#374151',
                                        border: `2px solid ${paymentType === 'FULL' ? '#10b981' : '#d1d5db'}`,
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '13px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    💰 دفع كامل
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPaymentType('PARTIAL');
                                        setPaidAmount(0);
                                        setDeliveredNow(false);
                                    }}
                                    style={{
                                        padding: '12px',
                                        background: paymentType === 'PARTIAL' ? '#f59e0b' : 'white',
                                        color: paymentType === 'PARTIAL' ? 'white' : '#374151',
                                        border: `2px solid ${paymentType === 'PARTIAL' ? '#f59e0b' : '#d1d5db'}`,
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '13px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    📊 دفع جزئي
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPaymentType('CREDIT');
                                        setPaidAmount(0);
                                        setDeliveredNow(false);
                                    }}
                                    style={{
                                        padding: '12px',
                                        background: paymentType === 'CREDIT' ? '#ef4444' : 'white',
                                        color: paymentType === 'CREDIT' ? 'white' : '#374151',
                                        border: `2px solid ${paymentType === 'CREDIT' ? '#ef4444' : '#d1d5db'}`,
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '13px',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    📝 آجل
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Partial Payment Amount Input */}
                    {paymentType === 'PARTIAL' && cart.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px', color: '#1e293b' }}>
                                المبلغ المدفوع الآن
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={paidAmount || ''}
                                onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                                placeholder="أدخل المبلغ المدفوع"
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '8px',
                                    fontSize: '14px'
                                }}
                            />
                            <div style={{ marginTop: '4px', fontSize: '12px', color: '#6b7280' }}>
                                المتبقي: {(totals.finalTotal - (paidAmount || 0)).toFixed(2)} ر.س
                            </div>
                        </div>
                    )}

                    {/* Delivery Checkbox */}
                    {paymentType !== 'CREDIT' && cart.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={deliveredNow}
                                    onChange={(e) => setDeliveredNow(e.target.checked)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <span style={{ fontWeight: '600', fontSize: '14px' }}>
                                    🚚 تسليم البضاعة الآن
                                </span>
                            </label>
                            {!deliveredNow && (
                                <div style={{ marginTop: '4px', fontSize: '12px', color: '#dc2626' }}>
                                    ⚠️ لن يتم خصم المخزون حتى يتم التسليم
                                </div>
                            )}
                        </div>
                    )}

                    {/* ✅ UPDATED: Payment Methods with restrictions */}
                    {/* Payment Methods - Always Available */}
                    <div className="payment-section">
                        <span className="section-subtitle">طريقة الدفع</span>
                        <div className="payment-methods-row">
                            {PAYMENT_METHODS.map(pm => (
                                <button
                                    key={pm.id}
                                    className={`pm-btn ${paymentMethod === pm.id ? 'active' : ''}`}
                                    onClick={() => setPaymentMethod(pm.id)}
                                    title={pm.name}
                                >
                                    <span className="pm-icon">{pm.icon}</span>
                                    <span className="pm-name">{pm.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Final Total Column */}
                    <div className="final-checkout-column">
                        <div className="total-display">
                            <div className="total-label">المجموع النهائي</div>
                            <div className="total-val">{totals.finalTotal.toFixed(2)} ر.س</div>
                        </div>

                        <button
                            className="pay-btn"
                            onClick={handleCheckout}
                            disabled={loading || cart.length === 0}
                        >
                            {loading ? '⏳ جاري المعالجة...' : CHANNELS[activeTab].btnText}
                        </button>
                    </div>
                </div>
            </div>

            {/* Custom Price Edit Modal */}
            {editingPrice && (
                <div className="modal-overlay" onClick={() => setEditingPrice(null)} style={{ zIndex: 1000 }}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', padding: '28px', borderRadius: '16px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '24px', paddingBottom: '20px', borderBottom: '2px solid #f1f5f9' }}>
                            <div style={{
                                width: '60px',
                                height: '60px',
                                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 16px',
                                fontSize: '28px'
                            }}>
                                💰
                            </div>
                            <h3 style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#1e293b' }}>تعديل السعر</h3>
                            <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: '#64748b' }}>
                                السعر الحالي: <strong>{editingPrice.currentPrice.toFixed(2)} ر.س</strong>
                            </p>
                        </div>

                        <div style={{ marginBottom: '20px', padding: '14px', background: '#fef3c7', borderRadius: '10px', border: '1px solid #fbbf24' }}>
                            <p style={{ margin: 0, fontSize: '13px', color: '#92400e', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: '500' }}>
                                <span style={{ fontSize: '18px' }}>⚠️</span>
                                يجب أن يكون السعر أعلى من الحد الأدنى المسموح به
                            </p>
                        </div>

                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.target as HTMLFormElement;
                            const input = form.elements.namedItem('customPrice') as HTMLInputElement;
                            const newPrice = parseFloat(input.value);

                            if (newPrice && newPrice >= editingPrice.cost) {
                                updateCustomPrice(editingPrice.productId, newPrice);
                            } else if (newPrice < editingPrice.cost) {
                                playBeep('error');
                                setMessage('⚠️ يجب أن يكون السعر أعلى من الحد الأدنى المسموح به');
                            }
                        }}>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600', color: '#475569' }}>
                                    السعر الجديد (ر.س)
                                </label>
                                <input
                                    type="number"
                                    name="customPrice"
                                    step="0.01"
                                    min="0"
                                    defaultValue={editingPrice.currentPrice}
                                    autoFocus
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '14px 16px',
                                        fontSize: '18px',
                                        fontWeight: '600',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '10px',
                                        textAlign: 'center',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    onFocus={(e) => {
                                        e.target.style.borderColor = '#6366f1';
                                        e.target.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.1)';
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderColor = '#e2e8f0';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                    placeholder="0.00"
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setEditingPrice(null)}
                                    style={{
                                        flex: 1,
                                        padding: '13px',
                                        background: '#f1f5f9',
                                        color: '#475569',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '15px',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#e2e8f0'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#f1f5f9'}
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        flex: 1,
                                        padding: '13px',
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        fontWeight: '700',
                                        fontSize: '15px',
                                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                                    }}
                                >
                                    <span style={{ fontSize: '18px' }}>✓</span>
                                    حفظ
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Search Modal */}
            {showSearch && (
                <div className="modal-overlay" onClick={() => setShowSearch(false)}>
                    <div className="search-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="search-header">
                            <Search size={20} />
                            <input
                                autoFocus
                                placeholder="ابحث بالاسم، الباركود، أو الكود..."
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                            />
                            <button onClick={() => setShowSearch(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '20px' }}>
                                ✕
                            </button>
                        </div>
                        <div className="search-results">
                            {searchResults.map(p => (
                                <div
                                    key={p.id}
                                    style={{
                                        padding: '12px',
                                        borderBottom: '1px solid #e5e7eb',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: p.stock === 0 ? 'not-allowed' : 'pointer',
                                        opacity: p.stock === 0 ? 0.5 : 1,
                                        background: 'white',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (p.stock !== 0) e.currentTarget.style.background = '#f9fafb';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'white';
                                    }}
                                >
                                    <div style={{ flex: 1, textAlign: 'right' }}>
                                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>{p.nameEn}</div>
                                        <div style={{ fontSize: '14px', color: '#10b981' }}>
                                            {selectedCustomer?.type === 'WHOLESALE' && p.priceWholesale ? p.priceWholesale : p.priceRetail} ر.س
                                        </div>
                                        {p.stock !== undefined && (
                                            <div style={{
                                                fontSize: '12px',
                                                color: p.stock === 0 ? '#ef4444' : p.stock <= 10 ? '#f59e0b' : '#10b981',
                                                fontWeight: 600,
                                                marginTop: '4px'
                                            }}>
                                                المخزون: {p.stock}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (p.stock !== 0) addToCart(p);
                                            else {
                                                playBeep('error');
                                                setMessage('❌ المنتج غير متوفر في المخزون');
                                            }
                                        }}
                                        disabled={p.stock === 0}
                                        style={{
                                            padding: '8px 16px',
                                            background: p.stock === 0 ? '#9ca3af' : '#3b82f6',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: p.stock === 0 ? 'not-allowed' : 'pointer',
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            opacity: p.stock === 0 ? 0.6 : 1
                                        }}
                                    >
                                        {p.stock === 0 ? '❌ نفذ' : '✓ إضافة'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Product Browser Modal - keeping existing code */}
            {showProductBrowser && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        zIndex: 1000,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                    dir="rtl"
                >
                    <div style={{
                        padding: '20px 30px',
                        background: 'rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(10px)',
                        borderBottom: '2px solid rgba(255,255,255,0.3)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10
                    }}>
                        <h2 style={{ margin: 0, fontSize: '28px', fontWeight: '800', color: '#667eea' }}>
                            🛒 تصفح المنتجات
                        </h2>
                        <button
                            onClick={() => setShowProductBrowser(false)}
                            style={{
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'white',
                                fontSize: '24px',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                        >
                            ✕
                        </button>
                    </div>

                    <div style={{ padding: '20px 30px', background: 'white', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '250px' }}>
                            <input
                                type="text"
                                placeholder="🔍 ابحث عن منتج..."
                                onChange={(e) => {
                                    const query = e.target.value.toLowerCase();
                                    if (query) {
                                        const filtered = browserProducts.filter(p =>
                                            p.nameAr?.toLowerCase().includes(query) ||
                                            p.nameEn?.toLowerCase().includes(query) ||
                                            p.code?.toLowerCase().includes(query) ||
                                            p.barcode?.toLowerCase().includes(query)
                                        );
                                        setBrowserProducts(filtered);
                                    } else {
                                        loadProductsForBrowser(selectedCategory || undefined);
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '12px 20px',
                                    fontSize: '15px',
                                    border: '2px solid #e5e7eb',
                                    borderRadius: '12px',
                                    outline: 'none',
                                    transition: 'all 0.2s'
                                }}
                                onFocus={(e) => e.currentTarget.style.borderColor = '#667eea'}
                                onBlur={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => {
                                    setSelectedCategory('');
                                    loadProductsForBrowser();
                                }}
                                style={{
                                    padding: '10px 20px',
                                    background: !selectedCategory ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                                    color: !selectedCategory ? 'white' : '#4b5563',
                                    border: '2px solid',
                                    borderColor: !selectedCategory ? 'transparent' : '#e5e7eb',
                                    borderRadius: '25px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                الكل
                            </button>
                            {categories.slice(0, 5).map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        setSelectedCategory(cat.id.toString());
                                        loadProductsForBrowser(cat.id.toString());
                                    }}
                                    style={{
                                        padding: '10px 20px',
                                        background: selectedCategory === cat.id.toString() ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                                        color: selectedCategory === cat.id.toString() ? 'white' : '#4b5563',
                                        border: '2px solid',
                                        borderColor: selectedCategory === cat.id.toString() ? 'transparent' : '#e5e7eb',
                                        borderRadius: '25px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {cat.nameAr || cat.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{
                        flex: 1,
                        padding: '30px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '20px',
                        alignContent: 'start'
                    }}>
                        {browserProducts.length === 0 ? (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.8)' }}>
                                <div style={{ fontSize: '64px', marginBottom: '16px' }}>📦</div>
                                <p style={{ fontSize: '18px', fontWeight: '500' }}>لا توجد منتجات</p>
                            </div>
                        ) : (
                            browserProducts.map(product => (
                                <div
                                    key={product.id}
                                    style={{
                                        background: 'white',
                                        padding: '20px',
                                        borderRadius: '16px',
                                        border: '2px solid #e5e7eb',
                                        cursor: product.stock === 0 ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        position: 'relative',
                                        height: '420px',
                                        opacity: product.stock === 0 ? 0.6 : 1
                                    }}
                                    onMouseEnter={(e) => {
                                        if (product.stock !== 0) {
                                            e.currentTarget.style.transform = 'translateY(-8px)';
                                            e.currentTarget.style.boxShadow = '0 12px 24px rgba(102, 126, 234, 0.25)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                                    }}
                                >
                                    {product.stock !== undefined && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '12px',
                                            left: '12px',
                                            padding: '6px 12px',
                                            background: product.stock <= 10
                                                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                            color: 'white',
                                            borderRadius: '20px',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                            zIndex: 1,
                                            minWidth: '50px',
                                            textAlign: 'center'
                                        }}>
                                            {product.stock === 0 ? '❌ نفذ' : `📦 ${product.stock}`}
                                        </div>
                                    )}

                                    <div style={{
                                        fontSize: '16px',
                                        fontWeight: '700',
                                        color: '#1e293b',
                                        marginBottom: '12px',
                                        height: '48px',
                                        overflow: 'hidden',
                                        textAlign: 'center',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        lineHeight: '1.4',
                                        direction: 'rtl'
                                    }}>
                                        {product.nameAr || product.nameEn}
                                    </div>

                                    <div style={{
                                        fontSize: '12px',
                                        color: '#64748b',
                                        marginBottom: '16px',
                                        textAlign: 'center',
                                        height: '36px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '4px'
                                    }}>
                                        <div style={{ fontWeight: '600' }}>{product.barcode}</div>
                                        {product.code && <div style={{ fontSize: '11px', color: '#94a3b8' }}>#{product.code}</div>}
                                    </div>

                                    <div style={{
                                        fontSize: '22px',
                                        fontWeight: '800',
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                        textAlign: 'center',
                                        marginBottom: '12px',
                                        height: '28px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        direction: 'rtl'
                                    }}>
                                        {(() => {
                                            const price = selectedCustomer?.type === 'WHOLESALE' && product.priceWholesale
                                                ? Number(product.priceWholesale)
                                                : Number(product.priceRetail);
                                            return `${price.toFixed(2)} ر.س`;
                                        })()}
                                    </div>

                                    {selectedCustomer?.type === 'WHOLESALE' && product.priceWholesale && (
                                        <div style={{
                                            fontSize: '12px',
                                            color: '#64748b',
                                            textAlign: 'center',
                                            marginBottom: '16px',
                                            textDecoration: 'line-through',
                                            opacity: 0.7
                                        }}>
                                            قطاعي: {Number(product.priceRetail).toFixed(2)} ر.س
                                        </div>
                                    )}

                                    <div style={{ flex: 1 }}></div>

                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (product.stock !== 0) {
                                                addToCart(product);
                                            } else {
                                                playBeep('error');
                                                setMessage('❌ المنتج غير متوفر في المخزون');
                                            }
                                        }}
                                        disabled={product.stock === 0}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            background: product.stock === 0 ? '#9ca3af' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '10px',
                                            cursor: product.stock === 0 ? 'not-allowed' : 'pointer',
                                            fontSize: '14px',
                                            fontWeight: '700',
                                            transition: 'all 0.2s',
                                            boxShadow: product.stock === 0 ? 'none' : '0 4px 12px rgba(102, 126, 234, 0.3)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            opacity: product.stock === 0 ? 0.6 : 1
                                        }}
                                        onMouseEnter={(e) => {
                                            if (product.stock !== 0) {
                                                e.currentTarget.style.transform = 'scale(1.02)';
                                                e.currentTarget.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.4)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (product.stock !== 0) {
                                                e.currentTarget.style.transform = 'scale(1)';
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.3)';
                                            }
                                        }}
                                    >
                                        {product.stock === 0 ? (
                                            <>
                                                <span style={{ fontSize: '18px' }}>❌</span>
                                                غير متوفر
                                            </>
                                        ) : (
                                            <>
                                                <span style={{ fontSize: '18px' }}>+</span>
                                                إضافة للسلة
                                            </>
                                        )}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ✅ UPDATED: Customer Modal with Create Button */}
            {showCustomerModal && (
                <div className="modal-overlay" onClick={() => setShowCustomerModal(false)}>
                    <div className="search-modal" onClick={(e) => e.stopPropagation()} style={{ width: '500px' }}>
                        <div className="search-header">
                            <Users size={20} />
                            <input
                                autoFocus
                                placeholder="ابحث عن عميل..."
                                value={customerSearch}
                                onChange={(e) => setCustomerSearch(e.target.value)}
                            />
                            {/* ✅ NEW: Add Customer Button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowCreateCustomer(true);
                                }}
                                style={{
                                    background: '#10b981',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'white',
                                    fontSize: '14px',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                                title="إضافة عميل جديد"
                            >
                                <span>+</span>
                                جديد
                            </button>
                            <button onClick={() => setShowCustomerModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '20px' }}>
                                ✕
                            </button>
                        </div>
                        <div className="search-results">
                            <div
                                className="search-item"
                                onClick={() => {
                                    setSelectedCustomer(null);
                                    setShowCustomerModal(false);
                                }}
                            >
                                <span className="font-bold">عميل نقدي (Retail)</span>
                                <span className="text-gray-500">Retail</span>
                            </div>
                            {customersList
                                .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                                .map(c => (
                                    <div
                                        key={c.id}
                                        className="search-item"
                                        onClick={() => {
                                            setSelectedCustomer(c);
                                            setShowCustomerModal(false);
                                        }}
                                    >
                                        <span>{c.name}</span>
                                        <span style={{ fontSize: '12px', background: '#eee', padding: '2px 6px', borderRadius: '4px' }}>
                                            {c.type}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ✅ NEW: Create Customer Modal */}
            {showCreateCustomer && (
                <div className="modal-overlay" onClick={() => setShowCreateCustomer(false)} style={{ zIndex: 1001 }}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px', padding: '24px' }}>
                        <h3 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '700' }}>➕ إضافة عميل جديد</h3>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600' }}>اسم العميل *</label>
                            <input
                                type="text"
                                value={newCustomer.name}
                                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                placeholder="أدخل اسم العميل"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '8px'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600' }}>رقم الهاتف</label>
                            <input
                                type="text"
                                value={newCustomer.phone}
                                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                placeholder="اختياري"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    border: '1px solid #d1d5db',
                                    borderRadius: '8px'
                                }}
                            />
                        </div>



                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600' }}>نوع العميل</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => setNewCustomer({ ...newCustomer, type: 'RETAIL' })}
                                    style={{
                                        flex: 1,
                                        padding: '10px',
                                        background: newCustomer.type === 'RETAIL' ? '#3b82f6' : 'white',
                                        color: newCustomer.type === 'RETAIL' ? 'white' : '#374151',
                                        border: `2px solid ${newCustomer.type === 'RETAIL' ? '#3b82f6' : '#d1d5db'}`,
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                    }}
                                >
                                    🛒 قطاعي (Retail)
                                </button>
                                <button
                                    onClick={() => setNewCustomer({ ...newCustomer, type: 'WHOLESALE' })}
                                    style={{
                                        flex: 1,
                                        padding: '10px',
                                        background: newCustomer.type === 'WHOLESALE' ? '#3b82f6' : 'white',
                                        color: newCustomer.type === 'WHOLESALE' ? 'white' : '#374151',
                                        border: `2px solid ${newCustomer.type === 'WHOLESALE' ? '#3b82f6' : '#d1d5db'}`,
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                    }}
                                >
                                    📦 جملة (Wholesale)
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={() => setShowCreateCustomer(false)}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: '#6b7280',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: '600'
                                }}
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={handleCreateCustomer}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: '600'
                                }}
                            >
                                ✓ حفظ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default POS;
