'use strict';
// Demo content: categories, ~50 original bilingual products with generated product art, zones, coupons,
// home-page banners/sections and info pages.
// The server loads it automatically on its very first start (set DEMO_DATA=off to start empty).
// Manual use:  npm run seed   ·   npm run seed -- --reset  (wipe the catalog, keep orders & customers)
const fs = require('node:fs');
const path = require('node:path');
const cfg = require('../src/config');
const { one, all, run, tx, insert, saveSettings } = require('../src/db');
const { productSVG, composeSVG } = require('../src/art');
const { reindex, invalidate } = require('../src/catalog');
const { invalidateContent } = require('../src/content');
const { ensureAdmin } = require('../src/auth');

// Returns false (and changes nothing) when the catalog already has products, unless reset is true.
function seedDemo({ reset = false } = {}) {
if (one('SELECT 1 FROM products LIMIT 1') && !reset) return false;
if (reset) tx(() => { for (const t of ['cart_items', 'wishlist', 'product_categories', 'variants', 'products', 'categories', 'banners', 'sections', 'pages', 'zones', 'coupons']) run(`DELETE FROM ${t}`); });

const DIR = path.join(cfg.UPLOAD_DIR, 'seed');
fs.mkdirSync(DIR, { recursive: true });
const save = (name, svg) => { fs.writeFileSync(path.join(DIR, name), svg); return `/uploads/seed/${name}`; };

// ---------- settings ----------
saveSettings({
  store_name_en: 'Kiko Palestine', store_name_ar: 'كيكو فلسطين', tagline_en: 'Makeup, skincare & fragrance — delivered across Palestine', tagline_ar: 'مكياج وعناية وعطور — توصيل لكل فلسطين',
  email: 'info@yourdomain.ps', phone: '+970 59 000 0000', whatsapp: '970590000000',
  address_en: 'Al-Irsal Street, Ramallah, Palestine', address_ar: 'شارع الإرسال، رام الله، فلسطين',
  hours_en: 'Sat–Thu, 9:00–19:00', hours_ar: 'السبت–الخميس، 9:00–19:00',
  instagram: 'https://instagram.com/', facebook: 'https://facebook.com/', tiktok: '',
  currency: 'ILS', currency_symbol: '₪', free_shipping_min: '200', order_prefix: 'KP-',
  announcements_en: 'Free delivery on orders over ₪200\nCash on delivery to the West Bank, Jerusalem & the 48 areas\nNew: the Desert Rose collection is here',
  announcements_ar: 'توصيل مجاني للطلبات فوق 200 ₪\nالدفع عند الاستلام في الضفة والقدس والداخل\nجديد: مجموعة وردة الصحراء وصلت',
  announcement_link: '/best-sellers',
  promo_enabled: '1', promo_text_en: 'Last days! Up to 30% off selected favourites', promo_text_ar: 'الأيام الأخيرة! خصم حتى 30% على منتجات مختارة',
  promo_link: '/sale', promo_ends: new Date(Date.now() + 3 * 864e5).toISOString(),
  popup_enabled: '1', popup_title_en: 'Join our Beauty Club', popup_title_ar: 'انضم إلى نادي الجمال',
  popup_text_en: 'Subscribe for launches and tips — and get 10% off your first order.', popup_text_ar: 'اشترك لتصلك أحدث المنتجات والنصائح — واحصل على خصم 10% على طلبك الأول.',
  popup_coupon: 'WELCOME10', cod_enabled: '1', card_enabled: '0', card_provider: 'paytabs',
  meta_title_en: 'Kiko Palestine — Makeup, Skincare & Fragrance', meta_title_ar: 'كيكو فلسطين — مكياج وعناية بالبشرة وعطور',
  meta_desc_en: 'Shop makeup, skincare and fragrances online with fast delivery to the West Bank, Jerusalem and the 48 areas. Cash on delivery available.',
  meta_desc_ar: 'تسوّق المكياج ومنتجات العناية والعطور أونلاين مع توصيل سريع للضفة الغربية والقدس والداخل. الدفع عند الاستلام متاح.',
});

// ---------- zones & coupons ----------
insert('zones', { name_en: 'West Bank', name_ar: 'الضفة الغربية', fee: 20, days_en: '1–3 working days', days_ar: '1–3 أيام عمل', sort: 1 });
insert('zones', { name_en: 'Jerusalem', name_ar: 'القدس', fee: 30, days_en: '2–3 working days', days_ar: '2–3 أيام عمل', sort: 2 });
insert('zones', { name_en: 'Inside (48 areas)', name_ar: 'الداخل (أراضي 48)', fee: 70, free_over: 400, days_en: '3–5 working days', days_ar: '3–5 أيام عمل', sort: 3 });
insert('coupons', { code: 'WELCOME10', type: 'percent', value: 10, per_customer: 1 });
insert('coupons', { code: 'FREESHIP', type: 'shipping', value: 0, min_total: 100 });
insert('coupons', { code: 'SAVE20', type: 'fixed', value: 20, min_total: 150 });

// ---------- categories ----------
const CAT = {};
const cat = (slug, en, ar, parent = null, extra = {}) => (CAT[slug] = insert('categories', { slug, name_en: en, name_ar: ar, parent_id: parent ? CAT[parent] : null, sort: Object.keys(CAT).length, ...extra }));
cat('collections', 'New & Collections', 'الجديد والمجموعات');
cat('seasonal-collections', 'Collections', 'المجموعات', 'collections');
cat('desert-rose', 'Desert Rose', 'وردة الصحراء', 'seasonal-collections', { desc_en: 'Soft rosy nudes inspired by sunsets over the hills.', desc_ar: 'درجات نود وردية ناعمة مستوحاة من غروب الشمس فوق التلال.' });
cat('golden-hour', 'Golden Hour', 'الساعة الذهبية', 'seasonal-collections', { desc_en: 'Warm bronzes and glowing highlights.', desc_ar: 'درجات برونزية دافئة وإضاءة متوهجة.' });
cat('velvet-nights', 'Velvet Nights', 'ليالٍ مخملية', 'seasonal-collections', { desc_en: 'Deep berries and smoky plums for the evening.', desc_ar: 'درجات توتية عميقة وبنفسجية مدخنة للسهرات.' });
cat('spring-bloom', 'Spring Bloom', 'تفتّح الربيع', 'seasonal-collections', { desc_en: 'Fresh pinks, corals and citrus notes.', desc_ar: 'درجات وردية ومرجانية منعشة ونفحات حمضية.' });
cat('new-in', 'New In', 'وصل حديثاً', 'collections');
cat('back-in-stock', 'Back in Stock', 'عاد إلى المخزون', 'collections');
cat('makeup', 'Makeup', 'مكياج');
cat('face', 'Face', 'الوجه', 'makeup');
for (const [s, e, a] of [['foundation', 'Foundation', 'كريم الأساس'], ['concealer', 'Concealer', 'الكونسيلر'], ['powder', 'Powder', 'البودرة'], ['contour', 'Contour', 'الكونتور'], ['blush', 'Blush', 'أحمر الخدود'], ['highlighter', 'Highlighter', 'الهايلايتر'], ['face-primer', 'Face Primer', 'برايمر الوجه'], ['bronzer', 'Bronzer', 'البرونزر'], ['face-palettes', 'Face Palettes', 'باليتات الوجه']]) cat(s, e, a, 'face');
cat('eyes', 'Eyes', 'العيون', 'makeup');
for (const [s, e, a] of [['eyeliner', 'Eyeliner', 'الآيلاينر'], ['brows', 'Brows', 'الحواجب'], ['eyeshadow', 'Eyeshadow', 'ظلال العيون'], ['eye-pencil', 'Eye Pencil', 'قلم العين'], ['mascara', 'Mascara', 'الماسكارا'], ['eye-palettes', 'Eye Palettes', 'باليتات العيون']]) cat(s, e, a, 'eyes');
cat('lips', 'Lips', 'الشفاه', 'makeup');
for (const [s, e, a] of [['lipstick', 'Lipstick', 'أحمر الشفاه'], ['lip-gloss', 'Lip Gloss', 'ملمع الشفاه'], ['lip-liner', 'Lip Liner', 'محدد الشفاه']]) cat(s, e, a, 'lips');
cat('skincare', 'Skincare', 'العناية بالبشرة');
cat('face-care', 'Face Care', 'العناية بالوجه', 'skincare');
for (const [s, e, a] of [['moisturizers', 'Moisturizers', 'المرطبات'], ['face-masks', 'Face Masks', 'ماسكات الوجه'], ['serums', 'Serums', 'السيروم'], ['sun-protection', 'Sun Protection', 'الحماية من الشمس'], ['cleansers', 'Cleansers', 'المنظفات']]) cat(s, e, a, 'face-care');
cat('eye-care', 'Eye Care', 'العناية بالعيون', 'skincare');
cat('eye-cream', 'Eye Cream', 'كريم العين', 'eye-care');
cat('eye-serum', 'Eye Serum', 'سيروم العين', 'eye-care');
cat('lip-care', 'Lip Care', 'العناية بالشفاه', 'skincare');
cat('skincare-lines', 'Skincare Lines', 'مجموعات العناية', 'skincare');
cat('aqua-line', 'Aqua Line — hydration', 'مجموعة أكوا — ترطيب', 'skincare-lines');
cat('glow-line', 'Glow Line — radiance', 'مجموعة الإشراقة', 'skincare-lines');
cat('fragrances', 'Fragrances', 'العطور');
cat('brushes-accessories', 'Brushes & Accessories', 'الفرش والإكسسوارات');
cat('face-accessories', 'Face Accessories', 'إكسسوارات الوجه', 'brushes-accessories');
cat('makeup-sponges', 'Makeup Sponges', 'إسفنجات المكياج', 'face-accessories');
cat('eye-accessories', 'Eye Accessories', 'إكسسوارات العيون', 'brushes-accessories');
cat('false-lashes', 'False Lashes', 'الرموش الصناعية', 'eye-accessories');
cat('hand-accessories', 'Hands & Nails', 'اليدين والأظافر', 'brushes-accessories');
cat('nail-files', 'Nail Files', 'مبارد الأظافر', 'hand-accessories');
cat('manicure', 'Manicure', 'العناية بالأظافر', 'hand-accessories');
cat('makeup-brushes', 'Makeup Brushes', 'فرش المكياج', 'brushes-accessories');
for (const [s, e, a] of [['face-brushes', 'Face Brushes', 'فرش الوجه'], ['eye-brushes', 'Eye Brushes', 'فرش العيون'], ['lip-brushes', 'Lip Brushes', 'فرش الشفاه']]) cat(s, e, a, 'makeup-brushes');
cat('travel', 'Travel', 'مستلزمات السفر', 'brushes-accessories');
cat('travel-bags', 'Travel Bags', 'حقائب السفر', 'travel');

// ---------- copy templates (by product type) ----------
const TXT = {
  lipstick: ['{en} glides on in one stroke with rich, even colour. Nourishing oils keep lips comfortable all day — no dryness, no cracking.', '{ar} ينزلق بسلاسة من أول تمريرة ويمنح لوناً غنياً ومتجانساً، مع زيوت مغذية تُبقي الشفاه مرتاحة طوال اليوم دون جفاف.',
    'Apply from the centre of the lips outwards. For sharper edges, outline first with a lip liner.', 'ضعه من منتصف الشفاه باتجاه الأطراف. لحدود أدق، حدد الشفاه أولاً بقلم التحديد.',
    'Ricinus Communis Seed Oil, Octyldodecanol, Cera Alba, Euphorbia Cerifera Wax, Simmondsia Chinensis Seed Oil, Tocopherol, Parfum. May contain: CI 77491, CI 15850, CI 77891.'],
  liquid_lip: ['A featherlight liquid formula that sets to a comfortable finish and won’t transfer onto cups. One coat gives full colour.', 'تركيبة سائلة خفيفة كالريشة تثبت بلمسة مريحة ولا تنتقل إلى الأكواب. طبقة واحدة تمنح لوناً كاملاً.',
    'Outline the lips with the doe-foot tip, then fill in. Let it set for 30 seconds before pressing lips together.', 'حدد الشفاه بطرف الفرشاة ثم املأها. اتركه 30 ثانية ليثبت قبل ضم الشفاه.',
    'Isododecane, Dimethicone, Trimethylsiloxysilicate, Silica, Tocopheryl Acetate, Parfum. May contain: CI 77491, CI 15985, CI 45410.'],
  gloss: ['High-shine gloss with a cushiony, non-sticky texture. Enriched with hydrating ingredients for soft, plump-looking lips.', 'ملمع عالي اللمعان بقوام ناعم غير لزج، غني بمكونات مرطبة لشفاه ناعمة وممتلئة المظهر.',
    'Wear alone for a glassy finish or over lipstick for extra dimension.', 'استخدمه وحده للمعان زجاجي أو فوق أحمر الشفاه لبُعد إضافي.',
    'Polybutene, Hydrogenated Polyisobutene, Sodium Hyaluronate, Tocopheryl Acetate, Aroma. May contain: CI 77891, CI 15850.'],
  lipliner: ['Creamy pencil that defines the lip line and stops colour from feathering. Long-lasting and easy to sharpen.', 'قلم كريمي يحدد خط الشفاه ويمنع انتشار اللون. ثابت لفترة طويلة وسهل البري.',
    'Outline the natural lip line, then fill in the lips for a longer-lasting base.', 'حدد الخط الطبيعي للشفاه ثم املأها لقاعدة تدوم أطول.', 'Hydrogenated Vegetable Oil, Cera Microcristallina, Tocopherol. May contain: CI 77491, CI 77891.'],
  balm: ['A melting balm with shea butter and vitamin E that soothes and protects dry lips.', 'بلسم ذائب بزبدة الشيا وفيتامين E يهدئ الشفاه الجافة ويحميها.', 'Apply as often as needed, day and night.', 'ضعه كلما احتجت، ليلاً ونهاراً.', 'Butyrospermum Parkii Butter, Ricinus Communis Seed Oil, Cera Alba, Tocopherol, Aroma.'],
  scrub: ['Brown-sugar scrub that gently buffs away dry flakes and leaves lips smooth and ready for colour.', 'مقشر بالسكر البني يزيل القشور الجافة بلطف ويترك الشفاه ناعمة وجاهزة للون.', 'Massage a small amount onto lips in circular motions, then wipe off.', 'دلّك كمية صغيرة على الشفاه بحركات دائرية ثم امسحها.', 'Sucrose, Ricinus Communis Seed Oil, Butyrospermum Parkii Butter, Tocopherol, Aroma.'],
  foundation: ['A breathable foundation that evens out skin tone while letting your natural skin show through. Comfortable all-day wear.', 'كريم أساس خفيف يوحّد لون البشرة ويُظهر جمالها الطبيعي، ومريح طوال اليوم.',
    'Shake well. Apply from the centre of the face outwards with a brush or damp sponge.', 'رجّ العبوة جيداً. ضعه من منتصف الوجه للخارج بالفرشاة أو بإسفنجة رطبة.',
    'Aqua, Cyclopentasiloxane, Glycerin, Dimethicone, Titanium Dioxide, Tocopheryl Acetate. May contain: CI 77491, CI 77492, CI 77499.'],
  concealer: ['Creamy, crease-resistant concealer that brightens the under-eye area and covers blemishes with a natural finish.', 'كونسيلر كريمي مقاوم للتجاعيد يضيء منطقة تحت العين ويغطي العيوب بلمسة طبيعية.',
    'Dot under the eyes and on blemishes, then tap gently with a fingertip or sponge to blend.', 'ضع نقاطاً تحت العينين وعلى العيوب ثم اربت بلطف بإصبعك أو بالإسفنجة لدمجه.', 'Aqua, Dimethicone, Glycerin, Titanium Dioxide, Tocopherol. May contain: CI 77491, CI 77492.'],
  powder: ['Finely milled powder that sets makeup, controls shine and blurs the look of pores without looking cakey.', 'بودرة ناعمة جداً تثبّت المكياج وتتحكم باللمعان وتموّه المسام دون أن تبدو ثقيلة.', 'Press over foundation with a puff or sweep on lightly with a fluffy brush.', 'اضغطها فوق كريم الأساس بالإسفنجة أو مرريها بخفة بفرشاة كثيفة.', 'Talc, Mica, Zinc Stearate, Dimethicone, Tocopherol. May contain: CI 77891, CI 77491.'],
  blush: ['Silky blush that builds from a soft wash of colour to a vivid flush and blends seamlessly.', 'أحمر خدود حريري يتدرج من لون ناعم إلى إشراقة واضحة ويندمج بسهولة.', 'Smile and apply to the apples of the cheeks, blending up towards the temples.', 'ابتسم وضعه على وجنتيك ثم ادمجه باتجاه الصدغين.', 'Talc, Mica, Ethylhexyl Palmitate, Tocopherol. May contain: CI 15850, CI 77491, CI 77891.'],
  bronzer: ['Matte bronzer that adds natural warmth and gentle definition without looking orange.', 'برونزر مات يضيف دفئاً طبيعياً وتحديداً لطيفاً دون لون برتقالي.', 'Sweep where the sun naturally hits: forehead, cheekbones and jawline.', 'مرّريه حيث تلامس الشمس الوجه: الجبهة وعظام الخد وخط الفك.', 'Talc, Mica, Dimethicone, Tocopherol. May contain: CI 77491, CI 77492, CI 77499.'],
  highlighter: ['Luminous powder with fine pearls for a lit-from-within glow on the high points of the face.', 'بودرة مضيئة بلآلئ دقيقة لتوهج طبيعي على النقاط البارزة من الوجه.', 'Apply on cheekbones, brow bone and the bridge of the nose.', 'ضعيه على عظام الخد وتحت الحاجب وعلى قصبة الأنف.', 'Mica, Talc, Synthetic Fluorphlogopite, Tocopherol. May contain: CI 77891, CI 77491.'],
  primer: ['Silky primer that smooths skin texture, blurs pores and helps makeup last longer.', 'برايمر حريري ينعّم ملمس البشرة ويموّه المسام ويساعد على ثبات المكياج لفترة أطول.', 'Apply a thin layer after moisturiser and before foundation.', 'ضع طبقة رقيقة بعد المرطب وقبل كريم الأساس.', 'Dimethicone, Cyclopentasiloxane, Dimethicone Crosspolymer, Tocopheryl Acetate.'],
  contour: ['Four complementary shades to sculpt, contour and highlight — in one compact.', 'أربع درجات متناسقة للنحت والكونتور والإضاءة في علبة واحدة.', 'Use the deeper shades under the cheekbones and along the jaw, the lighter ones to highlight.', 'استخدم الدرجات الداكنة تحت عظام الخد وعلى خط الفك، والفاتحة للإضاءة.', 'Talc, Mica, Dimethicone, Tocopherol. May contain: CI 77491, CI 77492, CI 77499, CI 77891.'],
  mascara: ['A smudge-resistant mascara that coats every lash from root to tip for bold, separated lashes.', 'ماسكارا مقاومة للتلطخ تغلّف كل رمش من الجذور حتى الأطراف لرموش واضحة ومنفصلة.', 'Wiggle the brush from the base of the lashes to the tips. Add a second coat while still wet.', 'حرّك الفرشاة من جذور الرموش إلى أطرافها. أضف طبقة ثانية قبل أن تجف.', 'Aqua, Cera Alba, Stearic Acid, Acacia Senegal Gum, Panthenol. May contain: CI 77499.'],
  eyeliner: ['Intense, quick-drying liquid liner with a flexible felt tip for anything from a fine line to a bold wing.', 'آيلاينر سائل مكثف وسريع الجفاف برأس مرن من أجل خط رفيع أو جناح جريء.', 'Draw from the inner corner outwards, keeping the tip close to the lash line.', 'ارسم من الزاوية الداخلية للخارج مع إبقاء الرأس قريباً من خط الرموش.', 'Aqua, Styrene/Acrylates Copolymer, Butylene Glycol, Panthenol. May contain: CI 77266.'],
  eyepencil: ['Soft kohl pencil with intense colour that can be smudged into a smoky look in seconds.', 'قلم كحل ناعم بلون مكثف يمكن تمويهه لإطلالة سموكي خلال ثوانٍ.', 'Line the upper and lower lash lines, then smudge with a brush for a softer look.', 'حدد خط الرموش العلوي والسفلي ثم موّهه بالفرشاة لإطلالة أنعم.', 'Hydrogenated Vegetable Oil, Cera Microcristallina, Tocopherol. May contain: CI 77499, CI 77491.'],
  brow: ['Fine-tipped brow pencil with a built-in spoolie to fill and shape brows with natural hair-like strokes.', 'قلم حواجب برأس رفيع مع فرشاة مدمجة لملء الحواجب وتشكيلها بخطوط تشبه الشعر الطبيعي.', 'Brush brows upwards, then fill sparse areas with light strokes and blend with the spoolie.', 'مشّط الحواجب للأعلى، ثم املأ الفراغات بخطوط خفيفة وادمجها بالفرشاة.', 'Hydrogenated Vegetable Oil, Cera Alba, Tocopherol. May contain: CI 77491, CI 77499.'],
  browgel: ['Clear gel that sets brows in place all day without stiffness or flakes.', 'جل شفاف يثبت الحواجب طوال اليوم دون تيبّس أو تقشر.', 'Brush through brows in an upward motion.', 'مرّريه على الحواجب باتجاه الأعلى.', 'Aqua, PVP, Glycerin, Panthenol, Phenoxyethanol.'],
  palette: ['A curated mix of matte and shimmer shades that blend like a dream for day-to-night looks.', 'تشكيلة مختارة من الدرجات المطفأة واللامعة تندمج بسهولة لإطلالات النهار والمساء.', 'Use matte shades in the crease and shimmers on the lid. Apply shimmers with a fingertip for maximum shine.', 'استخدم الدرجات المطفأة في ثنية العين واللامعة على الجفن. ضع اللامعة بالإصبع لأقصى لمعان.', 'Talc, Mica, Magnesium Stearate, Dimethicone, Tocopherol. May contain: CI 77491, CI 77499, CI 77891, CI 77007.'],
  eyeshadow: ['A single eyeshadow with rich pigment and a soft, blendable texture — wear it wet or dry.', 'ظل عيون منفرد بلون غني وقوام ناعم سهل الدمج — يُستخدم جافاً أو رطباً.', 'Pat onto the lid with a fingertip or brush. Use a damp brush for extra intensity.', 'اربتيه على الجفن بالإصبع أو الفرشاة. استخدمي فرشاة رطبة لكثافة أكبر.', 'Mica, Talc, Dimethicone, Tocopherol. May contain: CI 77491, CI 77891, CI 77007.'],
  moisturizer: ['A fresh gel-cream with hyaluronic acid that floods skin with hydration and leaves it soft, plump and comfortable.', 'جل كريمي منعش بحمض الهيالورونيك يغمر البشرة بالترطيب ويتركها ناعمة وممتلئة ومرتاحة.', 'Apply morning and evening to clean skin.', 'ضعه صباحاً ومساءً على بشرة نظيفة.', 'Aqua, Glycerin, Sodium Hyaluronate, Niacinamide, Squalane, Panthenol, Phenoxyethanol.'],
  serum: ['A lightweight serum that absorbs instantly and targets your skin concern with a high concentration of actives.', 'سيروم خفيف يمتصه الجلد فوراً ويستهدف مشكلة بشرتك بتركيز عالٍ من المكونات الفعالة.', 'Apply 3–4 drops to clean skin before moisturiser.', 'ضع 3–4 قطرات على بشرة نظيفة قبل المرطب.', 'Aqua, Glycerin, Sodium Hyaluronate, Panthenol, Allantoin, Phenoxyethanol.'],
  mask: ['A weekly treatment mask that resets the skin and leaves it visibly clearer and smoother.', 'ماسك أسبوعي يعيد توازن البشرة ويتركها أنقى وأنعم بشكل واضح.', 'Apply an even layer to clean skin, leave for 10 minutes, then rinse with warm water.', 'ضع طبقة متساوية على بشرة نظيفة واتركه 10 دقائق ثم اشطفه بالماء الدافئ.', 'Aqua, Kaolin, Bentonite, Glycerin, Aloe Barbadensis Leaf Juice, Phenoxyethanol.'],
  spf: ['An invisible, non-greasy sun fluid with high broad-spectrum protection — perfect under makeup.', 'واقٍ شمسي شفاف وغير دهني بحماية عالية واسعة الطيف — مثالي تحت المكياج.', 'Apply generously 15 minutes before sun exposure and reapply every 2 hours.', 'ضعه بكمية وافرة قبل التعرض للشمس بـ15 دقيقة وجدده كل ساعتين.', 'Aqua, Homosalate, Ethylhexyl Salicylate, Butyl Methoxydibenzoylmethane, Glycerin, Tocopherol.'],
  micellar: ['Gentle micellar water that lifts makeup, sunscreen and impurities in one step — no rinsing needed.', 'ماء ميسيلار لطيف يزيل المكياج والواقي الشمسي والشوائب بخطوة واحدة دون شطف.', 'Soak a cotton pad and sweep over face, eyes and lips.', 'بلل قطنة وامسح بها الوجه والعينين والشفاه.', 'Aqua, Glycerin, Poloxamer 184, Panthenol, Allantoin.'],
  cleanser: ['Soap-free foaming cleanser that removes impurities without stripping the skin.', 'غسول رغوي خالٍ من الصابون ينظف الشوائب دون أن يجفف البشرة.', 'Lather with water, massage onto damp skin and rinse. Use morning and evening.', 'ادعكه مع الماء ودلّك به البشرة الرطبة ثم اشطفه. صباحاً ومساءً.', 'Aqua, Coco-Glucoside, Glycerin, Sodium Lauroyl Sarcosinate, Panthenol.'],
  eyecream: ['A rich yet light eye cream that softens the look of dark circles and puffiness.', 'كريم غني وخفيف لمحيط العين يخفف مظهر الهالات والانتفاخ.', 'Tap gently around the eye area, morning and night.', 'اربت بلطف حول العين صباحاً ومساءً.', 'Aqua, Glycerin, Caffeine, Niacinamide, Squalane, Tocopherol.'],
  perfume: ['An original eau de parfum composed for long-lasting wear, from the first spray to the last note.', 'عطر أصلي مركّب ليدوم طويلاً، من أول رشة حتى آخر نفحة.', 'Spray on pulse points: wrists, neck and behind the ears.', 'رشّه على نقاط النبض: المعصمين والرقبة وخلف الأذنين.', 'Alcohol Denat., Parfum, Aqua, Limonene, Linalool, Citronellol.'],
  sponge: ['Latex-free sponge that bounces liquids and creams into skin for a seamless, airbrushed finish.', 'إسفنجة خالية من اللاتكس تدمج السوائل والكريمات في البشرة بلمسة ناعمة متجانسة.', 'Dampen, squeeze out excess water and dab onto the skin.', 'بلّلها واعصر الماء الزائد ثم اربت بها على البشرة.', ''],
  brush: ['Soft synthetic bristles that pick up just the right amount of product and blend effortlessly. Cruelty-free.', 'شعيرات صناعية ناعمة تلتقط الكمية المناسبة من المنتج وتدمجها بسهولة. خالية من القسوة على الحيوان.', 'Wash weekly with mild soap and leave to dry flat.', 'اغسلها أسبوعياً بصابون لطيف واتركها تجف بشكل أفقي.', ''],
  lashes: ['Lightweight lashes on a flexible band for instant, natural-looking definition. Reusable.', 'رموش خفيفة على شريط مرن لتحديد فوري وطبيعي. قابلة لإعادة الاستخدام.', 'Trim to fit your eye, apply lash glue to the band, wait 30 seconds and press along the lash line.', 'قصّها على مقاس عينك، ضع الغراء على الشريط وانتظر 30 ثانية ثم اضغطها على خط الرموش.', ''],
  file: ['Durable glass file that shapes nails smoothly and seals the edge to prevent splitting.', 'مبرد زجاجي متين يشكّل الأظافر بنعومة ويغلق أطرافها لمنع التشقق.', 'File in one direction from the side to the centre.', 'ابرد باتجاه واحد من الجانب إلى المنتصف.', ''],
  nail: ['A high-shine polish with a gel-like finish and a wide brush for streak-free application.', 'طلاء عالي اللمعان بتأثير الجل وفرشاة عريضة لتطبيق دون خطوط.', 'Apply two thin coats and finish with a top coat for extra wear.', 'ضعي طبقتين رقيقتين وأنهي بطبقة حماية لثبات أطول.', 'Butyl Acetate, Ethyl Acetate, Nitrocellulose, Isopropyl Alcohol. May contain: CI 77891, CI 15850.'],
  bag: ['A roomy, water-resistant makeup bag with inner pockets to keep your essentials organised on the go.', 'حقيبة مكياج واسعة ومقاومة للماء بجيوب داخلية لتنظيم أساسياتك أثناء التنقل.', 'Wipe clean with a damp cloth.', 'تُنظف بقطعة قماش رطبة.', ''],
};

// [slug, art kind, template, EN name, AR name, EN short, AR short, price, sale, categories, flags, shades|color, stock, art opts]
const S = (en, ar, hex, stock = 25) => ({ en, ar, hex, stock });
const P = [
  ['cloud-matte-lipstick', 'lipstick', 'lipstick', 'Cloud Matte Lipstick', 'أحمر شفاه كلاود مات', 'Weightless matte colour for up to 8 hours', 'لون مات خفيف يدوم حتى 8 ساعات', 59, 47, ['lipstick', 'desert-rose'], 'best',
    [S('01 Bare Rose', '01 وردي هادئ', '#c48b84', 30), S('02 Terracotta', '02 تيراكوتا', '#a8503c'), S('03 Rosewood', '03 خشب الورد', '#9a4f56'), S('04 Berry Kiss', '04 توتي', '#8a2a4b', 12), S('05 Classic Red', '05 أحمر كلاسيكي', '#b3172f', 40), S('06 Plum Night', '06 برقوقي', '#5e2240', 3), S('07 Cocoa', '07 كاكاو', '#6e3b2e', 0)]],
  ['silk-satin-lipstick', 'lipstick', 'lipstick', 'Silk Satin Lipstick', 'أحمر شفاه سيلك ساتان', 'Creamy satin finish with jojoba oil', 'لمسة ساتان كريمية بزيت الجوجوبا', 55, null, ['lipstick', 'spring-bloom', 'new-in'], 'new',
    [S('Peach Petal', 'بتلة خوخ', '#e58a72'), S('Pink Blossom', 'زهرة وردية', '#e07a98'), S('Coral Sun', 'مرجاني', '#f0614f'), S('Mauve Silk', 'موف حريري', '#b17786')]],
  ['stay-put-liquid-lipstick', 'liquid', 'liquid_lip', 'Stay-Put Liquid Lipstick', 'أحمر شفاه سائل ثابت', 'Transfer-proof colour up to 12 hours', 'لون لا ينتقل يدوم حتى 12 ساعة', 69, null, ['lipstick', 'velvet-nights'], 'best',
    [S('Nude Latte', 'نود لاتيه', '#b98273'), S('Brick', 'طوبي', '#96412f'), S('Wine', 'نبيذي', '#6c1d33'), S('Fuchsia', 'فوشيا', '#c2185b'), S('Deep Red', 'أحمر داكن', '#8e0f23', 4)]],
  ['glass-shine-lip-gloss', 'gloss', 'gloss', 'Glass Shine Lip Gloss', 'ملمع شفاه جلاس شاين', 'Mirror shine with hyaluronic acid', 'لمعان كالمرآة مع حمض الهيالورونيك', 49, 39, ['lip-gloss'], 'best',
    [S('Crystal', 'كريستال', '#f2e6e6'), S('Pink Glaze', 'وردي لامع', '#f0a5b8'), S('Peach Glow', 'خوخي مشرق', '#f5b49a'), S('Berry Glass', 'توتي زجاجي', '#b4466a')]],
  ['plumping-lip-oil', 'gloss', 'gloss', 'Plumping Lip Oil', 'زيت شفاه منفّخ', 'Tinted oil with a cooling plump effect', 'زيت ملوّن بتأثير منفّخ ومنعش', 54, null, ['lip-gloss', 'lip-care', 'new-in'], 'new limited',
    [S('Clear Mint', 'نعناع شفاف', '#e9f2ec'), S('Rosy', 'وردي', '#e79aa7'), S('Cherry', 'كرزي', '#b5223b')]],
  ['define-lip-liner', 'pencil', 'lipliner', 'Define Lip Liner', 'قلم تحديد الشفاه ديفاين', 'Creamy, long-lasting definition', 'تحديد كريمي يدوم طويلاً', 39, null, ['lip-liner'], '',
    [S('Natural', 'طبيعي', '#b8807a'), S('Rose', 'وردي', '#b0626d'), S('Red', 'أحمر', '#a3162b'), S('Brown', 'بني', '#7b4a3c')]],
  ['shea-lip-balm', 'stick', 'balm', 'Shea Butter Lip Balm', 'بلسم شفاه بزبدة الشيا', 'Soothing balm for soft lips', 'بلسم مهدئ لشفاه ناعمة', 32, null, ['lip-care'], '', '#f2b8b0', 60],
  ['sugar-lip-scrub', 'jar', 'scrub', 'Sugar Lip Scrub', 'مقشر شفاه بالسكر', 'Gently exfoliates with brown sugar', 'تقشير لطيف بالسكر البني', 35, 28, ['lip-care', 'back-in-stock'], '', '#e8a7a0', 40],
  ['true-skin-foundation', 'foundation', 'foundation', 'True Skin Foundation', 'كريم أساس ترو سكن', 'Medium coverage, natural matte, SPF 15', 'تغطية متوسطة بلمسة مات طبيعية وSPF 15', 99, null, ['foundation'], 'best',
    [S('10 Porcelain', '10 بورسلان', '#f1d6c4'), S('20 Ivory', '20 عاجي', '#ead0b5'), S('30 Beige', '30 بيج', '#ddb594'), S('40 Sand', '40 رملي', '#cfa47e'), S('50 Honey', '50 عسلي', '#b9875d'), S('60 Caramel', '60 كراميل', '#9c6a45'), S('70 Mocha', '70 موكا', '#7a4b31', 5)]],
  ['glow-serum-foundation', 'foundation', 'foundation', 'Glow Serum Foundation', 'كريم أساس سيروم مضيء', 'Light coverage with a radiant finish', 'تغطية خفيفة بلمسة مشرقة', 109, 89, ['foundation', 'golden-hour', 'new-in'], 'new',
    [S('Light', 'فاتح', '#ecd2bc'), S('Medium', 'متوسط', '#d6ab88'), S('Tan', 'حنطي', '#b98a62'), S('Deep', 'داكن', '#8c5a3a')]],
  ['bright-eyes-concealer', 'liquid', 'concealer', 'Bright Eyes Concealer', 'كونسيلر برايت آيز', 'Hides dark circles & blemishes', 'يخفي الهالات السوداء والعيوب', 59, null, ['concealer'], 'best',
    [S('Fair', 'فاتح جداً', '#f0d4c0'), S('Light', 'فاتح', '#e6c3a5'), S('Medium', 'متوسط', '#cfa17c'), S('Tan', 'حنطي', '#b07f58'), S('Deep', 'داكن', '#84593b')]],
  ['soft-focus-powder', 'compact', 'powder', 'Soft Focus Pressed Powder', 'بودرة مضغوطة سوفت فوكس', 'Sets makeup and controls shine', 'تثبت المكياج وتتحكم باللمعان', 75, null, ['powder'], '',
    [S('Translucent', 'شفاف', '#efe2d6'), S('Light', 'فاتح', '#e8cdb3'), S('Medium', 'متوسط', '#d1a985')]],
  ['flush-powder-blush', 'compact', 'blush', 'Flush Powder Blush', 'أحمر خدود فلاش', 'Buildable colour for a fresh flush', 'لون قابل للتدرج لإشراقة طبيعية', 55, null, ['blush', 'desert-rose'], 'best',
    [S('Rosy Cheek', 'وردي', '#e08a8f'), S('Peach', 'خوخي', '#f0a07c'), S('Mauve', 'موف', '#c07f8e'), S('Berry', 'توتي', '#b0455f')]],
  ['dewy-cheek-stick', 'stick', 'blush', 'Dewy Cheek Stick', 'ستيك خدود ندي', 'Blends with fingertips for a dewy finish', 'يُدمج بالأصابع بلمسة ندية', 62, null, ['blush', 'spring-bloom', 'new-in'], 'new',
    [S('Pink Tulip', 'توليب وردي', '#e47c94'), S('Apricot', 'مشمشي', '#f29a76'), S('Sunset', 'غروب', '#e0674f')]],
  ['sun-kissed-bronzer', 'compact', 'bronzer', 'Sun-Kissed Bronzer', 'برونزر لمسة الشمس', 'Warm, natural-looking tan', 'سمرة دافئة وطبيعية', 72, 58, ['bronzer', 'golden-hour'], '',
    [S('Light Bronze', 'برونزي فاتح', '#c78f63'), S('Deep Bronze', 'برونزي داكن', '#9e6740')]],
  ['starlight-highlighter', 'compact', 'highlighter', 'Starlight Highlighter', 'هايلايتر ستارلايت', 'Pearly glow for the cheekbones', 'توهج لؤلؤي لعظام الخد', 65, null, ['highlighter', 'golden-hour'], 'limited',
    [S('Champagne', 'شامبانيا', '#f1d9b5'), S('Rose Gold', 'ذهبي وردي', '#e9b4a0'), S('Bronze Glow', 'برونزي لامع', '#d29d6c')], 0, { shimmer: true }],
  ['blur-face-primer', 'tube', 'primer', 'Blur Face Primer', 'برايمر بلور للوجه', 'Blurs pores and extends wear', 'يموّه المسام ويطيل ثبات المكياج', 69, null, ['face-primer'], '', '#f2d9d0', 35],
  ['sculpt-contour-palette', 'palette', 'contour', 'Sculpt & Contour Palette', 'باليت النحت والكونتور', 'Four shades to contour and highlight', 'أربع درجات للنحت والإضاءة', 89, null, ['contour', 'face-palettes'], '', '#b07a55', 22, { colors: ['#f1d9c2', '#d7a77d', '#a5704d', '#7c4e33'] }],
  ['big-lash-mascara', 'mascara', 'mascara', 'Big Lash Mascara', 'ماسكارا بيغ لاش', 'Instant volume, zero clumps', 'كثافة فورية بدون تكتل', 59, 47, ['mascara'], 'best', '#1a1a1a', 80],
  ['rain-proof-length-mascara', 'mascara', 'mascara', 'Rain-Proof Length Mascara', 'ماسكارا مقاومة للماء للتطويل', 'Long lashes that last all day', 'رموش طويلة تدوم طوال اليوم', 65, null, ['mascara', 'back-in-stock'], '',
    [S('Black', 'أسود', '#111111', 40), S('Brown', 'بني', '#4a2c1d', 15)]],
  ['midnight-liquid-eyeliner', 'eyeliner', 'eyeliner', 'Midnight Liquid Eyeliner', 'آيلاينر سائل ميدنايت', 'Felt tip for precise wings', 'رأس دقيق لرسم خط مثالي', 49, null, ['eyeliner'], 'best', '#151515', 70],
  ['kohl-eye-pencil', 'pencil', 'eyepencil', 'Kohl Eye Pencil', 'قلم كحل للعيون', 'Intense, smudgeable colour', 'لون مكثف قابل للتمويه', 35, null, ['eye-pencil'], '',
    [S('Black', 'أسود', '#151515', 50), S('Brown', 'بني', '#5b3a29'), S('Navy', 'كحلي', '#1f2f5e'), S('Emerald', 'زمردي', '#145a44')]],
  ['brow-sculpt-pencil', 'pencil', 'brow', 'Brow Sculpt Pencil', 'قلم الحواجب سكلبت', 'With a spoolie for natural brows', 'مع فرشاة لحواجب طبيعية', 42, null, ['brows'], '',
    [S('Blonde', 'أشقر', '#a07f5f'), S('Taupe', 'رمادي بني', '#7e6655'), S('Brown', 'بني', '#5d4232'), S('Dark', 'داكن', '#3b2a21')], 0, { body: '#6b4b3a' }],
  ['brow-lock-clear-gel', 'mascara', 'browgel', 'Brow Lock Clear Gel', 'جل الحواجب الشفاف', 'Sets brows all day', 'يثبت الحواجب طوال اليوم', 39, null, ['brows'], '', '#d9cfc7', 45],
  ['desert-nudes-palette', 'palette', 'palette', 'Desert Nudes Eyeshadow Palette', 'باليت ظلال نود الصحراء', '9 matte & shimmer nudes', '9 درجات نود مطفأة ولامعة', 119, 95, ['eye-palettes', 'desert-rose'], 'best limited', '#c98b6b', 18],
  ['sunset-eyeshadow-palette', 'palette', 'palette', 'Sunset Eyeshadow Palette', 'باليت ظلال الغروب', 'Warm oranges, golds & bronzes', 'درجات برتقالية وذهبية وبرونزية دافئة', 119, null, ['eye-palettes', 'golden-hour', 'new-in'], 'new', '#d9823f', 20,
    { colors: ['#f6d7a7', '#f0b26b', '#e08a3c', '#c2662a', '#d4a24c', '#a5683b', '#8a3f22', '#f3c27e', '#6e3a24'] }],
  ['velvet-night-palette', 'palette', 'palette', 'Velvet Night Eyeshadow Palette', 'باليت ظلال الليلة المخملية', 'Smoky plums, berries and black', 'درجات سموكي بنفسجية وتوتية وسوداء', 119, null, ['eye-palettes', 'velvet-nights'], '', '#6e3a52', 15,
    { colors: ['#d8b4c4', '#a86a8a', '#7a3a5e', '#4e2340', '#2a1a24', '#c58fa8', '#8c2f4f', '#5c2a3a', '#151515'] }],
  ['pure-pigment-eyeshadow', 'compact', 'eyeshadow', 'Pure Pigment Eyeshadow', 'ظل عيون بيور بيجمنت', 'Highly pigmented and blendable', 'ألوان غنية وسهلة الدمج', 35, null, ['eyeshadow'], '',
    [S('Gold', 'ذهبي', '#d4a24c'), S('Bronze', 'برونزي', '#a5683b'), S('Rose', 'وردي', '#c98a8a'), S('Taupe', 'رمادي بني', '#8c7366'), S('Plum', 'برقوقي', '#6e3a52'), S('Emerald', 'زمردي', '#1f6b54')], 0, { shimmer: true }],
  ['aqua-boost-cream', 'jar', 'moisturizer', 'Aqua Boost Moisturizing Cream', 'كريم أكوا بوست المرطب', '72-hour hydration with hyaluronic acid', 'ترطيب 72 ساعة بحمض الهيالورونيك', 89, null, ['moisturizers', 'aqua-line'], 'best', '#9cc7cf', 40],
  ['hyaluronic-acid-serum', 'serum', 'serum', 'Hyaluronic Acid Serum', 'سيروم حمض الهيالورونيك', 'Plumps and smooths fine lines', 'يملأ البشرة ويخفف الخطوط الدقيقة', 109, 89, ['serums', 'aqua-line'], 'best', '#7fb9c6', 33],
  ['vitamin-c-glow-serum', 'serum', 'serum', 'Vitamin C Glow Serum', 'سيروم فيتامين سي للإشراقة', 'Brightens dull, tired skin', 'يضيء البشرة الباهتة والمتعبة', 115, null, ['serums', 'glow-line', 'new-in'], 'new', '#e39b3a', 28],
  ['green-clay-mask', 'tube', 'mask', 'Green Clay Purifying Mask', 'ماسك الطين الأخضر المنقي', 'Deep-cleans pores in 10 minutes', 'ينظف المسام بعمق خلال 10 دقائق', 65, null, ['face-masks'], '', '#8fa88a', 26],
  ['overnight-glow-mask', 'jar', 'mask', 'Overnight Glow Mask', 'ماسك الإشراقة الليلي', 'Wake up to radiant skin', 'استيقظ ببشرة مشرقة', 79, null, ['face-masks', 'glow-line'], 'limited', '#f0b8a5', 14],
  ['invisible-sun-fluid-spf50', 'tube', 'spf', 'Invisible Sun Fluid SPF 50', 'واقي شمس شفاف SPF 50', 'Lightweight daily protection', 'حماية يومية خفيفة', 85, null, ['sun-protection'], 'best', '#f5d76e', 50],
  ['micellar-cleansing-water', 'bottle', 'micellar', 'Micellar Cleansing Water', 'ماء ميسيلار منظف', 'Removes makeup in one step', 'يزيل المكياج بخطوة واحدة', 49, 39, ['cleansers', 'aqua-line'], '', '#a7d3e0', 55],
  ['gentle-foaming-cleanser', 'tube', 'cleanser', 'Gentle Foaming Cleanser', 'غسول رغوي لطيف', 'Soap-free, for all skin types', 'خالٍ من الصابون لكل أنواع البشرة', 55, null, ['cleansers'], '', '#cde6d9', 38],
  ['eye-contour-cream', 'jar', 'eyecream', 'Eye Contour Cream', 'كريم محيط العين', 'Softens puffiness & dark circles', 'يخفف الانتفاخ والهالات', 79, null, ['eye-cream'], '', '#d9c3e6', 24],
  ['caffeine-eye-serum', 'serum', 'eyecream', 'Caffeine Eye Serum', 'سيروم العين بالكافيين', 'Cooling serum for tired eyes', 'سيروم منعش للعيون المتعبة', 69, null, ['eye-serum', 'new-in'], 'new', '#b9a089', 30],
  ['rose-oud-eau-de-parfum', 'perfume', 'perfume', 'Rose Oud Eau de Parfum', 'عطر ورد وعود', 'Damask rose with smoky oud', 'ورد دمشقي مع عود مدخّن', 189, null, ['fragrances'], 'best', '#c98a8a', 20, { capColor: '#2a1a14' }],
  ['vanilla-musk-eau-de-parfum', 'perfume', 'perfume', 'Vanilla Musk Eau de Parfum', 'عطر فانيلا ومسك', 'Soft, warm and addictive', 'ناعم ودافئ وجذاب', 169, 139, ['fragrances'], '', '#e8cfa8', 18],
  ['citrus-bloom-eau-de-toilette', 'perfume', 'perfume', 'Citrus Bloom Eau de Toilette', 'عطر سيتروس بلوم', 'Fresh orange blossom & bergamot', 'زهر البرتقال المنعش والبرغموت', 149, null, ['fragrances', 'spring-bloom', 'new-in'], 'new', '#f3d27a', 22],
  ['amber-nights-eau-de-parfum', 'perfume', 'perfume', 'Amber Nights Eau de Parfum', 'عطر ليالي العنبر', 'Amber, saffron and sandalwood', 'عنبر وزعفران وخشب الصندل', 199, null, ['fragrances', 'velvet-nights'], 'limited', '#b36a3c', 9, { capColor: '#151515' }],
  ['blending-sponge', 'sponge', 'sponge', 'Blending Sponge', 'إسفنجة الدمج', 'Flawless, streak-free blending', 'دمج مثالي بدون خطوط', 29, null, ['makeup-sponges'], 'best',
    [S('Pink', 'وردي', '#f19bb0', 60), S('Black', 'أسود', '#2b2b2b', 30), S('Peach', 'خوخي', '#f6b38f', 25)]],
  ['flat-foundation-brush', 'brush', 'brush', 'Flat Foundation Brush', 'فرشاة كريم الأساس المسطحة', 'For liquid and cream formulas', 'للتركيبات السائلة والكريمية', 45, null, ['face-brushes'], '', '#2a2a2a', 30, { head: 'flat' }],
  ['fluffy-powder-brush', 'brush', 'brush', 'Fluffy Powder Brush', 'فرشاة البودرة الكثيفة', 'Soft and dense for powder & blush', 'ناعمة وكثيفة للبودرة وأحمر الخدود', 49, null, ['face-brushes'], '', '#c79a6b', 26, { head: 'round' }],
  ['eyeshadow-blending-brush', 'brush', 'brush', 'Eyeshadow Blending Brush', 'فرشاة دمج ظلال العيون', 'Tapered tip for a soft crease', 'رأس مدبب لدمج ناعم', 32, null, ['eye-brushes'], 'best', '#3a2a2a', 40, { head: 'small' }],
  ['precision-lip-brush', 'brush', 'brush', 'Precision Lip Brush', 'فرشاة الشفاه الدقيقة', 'Fine tip for a clean lip line', 'رأس رفيع لخط شفاه نظيف', 25, null, ['lip-brushes'], '', '#1f1f1f', 35, { head: 'fine' }],
  ['natural-false-lashes', 'lashes', 'lashes', 'Natural False Lashes', 'رموش صناعية طبيعية', 'Lightweight, reusable up to 10 times', 'خفيفة وقابلة للاستخدام حتى 10 مرات', 35, null, ['false-lashes'], '', '#e8b9c5', 40],
  ['volume-false-lashes', 'lashes', 'lashes', 'Volume False Lashes', 'رموش صناعية كثيفة', 'Dramatic volume for special nights', 'كثافة لافتة للمناسبات', 39, null, ['false-lashes', 'new-in'], 'new', '#c9a0dc', 32],
  ['glass-nail-file', 'file', 'file', 'Glass Nail File', 'مبرد أظافر زجاجي', 'Smooth, long-lasting glass file', 'مبرد زجاجي ناعم يدوم طويلاً', 29, null, ['nail-files'], '', '#e7c6d6', 45],
  ['gel-effect-nail-polish', 'nail', 'nail', 'Gel Effect Nail Polish', 'طلاء أظافر بتأثير الجل', 'High shine and chip-resistant', 'لمعان عالٍ ومقاوم للتقشر', 29, 23, ['manicure'], 'best',
    [S('Nude', 'نود', '#d7a99a'), S('Ballet Pink', 'وردي باليه', '#f3b8c4'), S('Red', 'أحمر', '#b3172f'), S('Burgundy', 'عنابي', '#6b1a2c'), S('Coral', 'مرجاني', '#f0614f'), S('Black', 'أسود', '#151515')]],
  ['travel-makeup-bag', 'bag', 'bag', 'Travel Makeup Bag', 'حقيبة مكياج للسفر', 'Water-resistant, with inner pockets', 'مقاومة للماء مع جيوب داخلية', 69, null, ['travel-bags'], '',
    [S('Black', 'أسود', '#2b2b2b', 20), S('Blush', 'وردي فاتح', '#e8b4b8', 12)]],
];

const fill = (s, p) => s.replace('{en}', p.name_en).replace('{ar}', p.name_ar);
let n = 0;
tx(() => {
  for (const [slug, kind, tpl, name_en, name_ar, short_en, short_ar, price, sale, cats, flags, shades, stock = 0, opts = {}] of P) {
    const T = TXT[tpl];
    const base = Array.isArray(shades) ? shades[0].hex : shades;
    const images = [save(`${slug}.svg`, productSVG(kind, base, opts))];
    const id = insert('products', {
      slug, sku: 'KP-' + String(1001 + n++), name_en, name_ar, short_en, short_ar, price, sale_price: sale,
      desc_en: fill(T[0], { name_en, name_ar }), desc_ar: fill(T[1], { name_en, name_ar }), howto_en: T[2], howto_ar: T[3], ingredients: T[4] || null,
      stock: Array.isArray(shades) ? 0 : stock, is_new: /new/.test(flags) ? 1 : 0, is_bestseller: /best/.test(flags) ? 1 : 0, is_limited: /limited/.test(flags) ? 1 : 0,
      featured: /best/.test(flags) ? 1 : 0, images: JSON.stringify(images), main_cat: CAT[cats[0]], sort: n,
    });
    cats.forEach((c) => run('INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)', id, CAT[c]));
    if (Array.isArray(shades)) {
      shades.forEach((v, i) => insert('variants', {
        product_id: id, name_en: v.en, name_ar: v.ar, color: v.hex, stock: v.stock, sort: i,
        sku: `KP-${1000 + n}-${String(i + 1).padStart(2, '0')}`, image: i ? save(`${slug}-${i + 1}.svg`, productSVG(kind, v.hex, opts)) : images[0],
      }));
    }
    reindex(id);
  }
  // a few realistic sales counts so "best selling" sort has data
  run('UPDATE products SET sold = (id * 7) % 23 + is_bestseller * 30');
});
invalidate();

// ---------- home page content ----------
const art = (name, items, o) => save(name, composeSVG(items, o));
const hero = [
  ['Desert Rose', 'وردة الصحراء', 'Soft rosy nudes for lips, eyes and cheeks', 'درجات نود وردية ناعمة للشفاه والعيون والخدود', 'Discover the collection', 'اكتشف المجموعة', '/c/desert-rose', '#efedea',
    [{ kind: 'lipstick', color: '#a8503c', x: 30, y: 70, s: 0.9 }, { kind: 'palette', color: '#c98b6b', x: 300, y: 240, s: 0.78 }, { kind: 'compact', color: '#c78f63', x: 520, y: 60, s: 0.62 }]],
  ['Your daily glow ritual', 'روتين الإشراقة اليومي', 'Serums and creams with hyaluronic acid and vitamin C', 'سيروم وكريمات بحمض الهيالورونيك وفيتامين سي', 'Shop skincare', 'تسوّق العناية', '/c/skincare', '#f2f2f2',
    [{ kind: 'serum', color: '#7fb9c6', x: 60, y: 60, s: 0.92 }, { kind: 'jar', color: '#9cc7cf', x: 330, y: 220, s: 0.8 }, { kind: 'tube', color: '#f5d76e', x: 590, y: 70, s: 0.72 }]],
  ['Up to 30% off', 'خصم حتى 30%', 'Best-loved makeup at special prices — while stocks last', 'منتجات المكياج المفضلة بأسعار خاصة — حتى نفاد الكمية', 'Shop the offers', 'تسوّق العروض', '/sale', '#000000',
    [{ kind: 'nail', color: '#b3172f', x: 60, y: 110, s: 0.82 }, { kind: 'lipstick', color: '#8e0f23', x: 320, y: 40, s: 0.95 }, { kind: 'gloss', color: '#f2e6e6', x: 580, y: 120, s: 0.75 }]],
];
hero.forEach(([te, ta, se, sa, ce, ca, link, bg, items], i) => insert('banners', { placement: 'hero', title_en: te, title_ar: ta, sub_en: se, sub_ar: sa, cta_en: ce, cta_ar: ca, link, bg, sort: i, image: art(`hero-${i + 1}.svg`, items, { w: 900, h: 700, circle: { x: 460, y: 380, r: 300, fill: '#ffffff', o: bg === '#000000' ? 0.07 : 0.6 } }) }));

const circles = [['Makeup', 'مكياج', '/c/makeup', 'lipstick', '#b3172f', '#f2f2f2'], ['Skincare', 'العناية', '/c/skincare', 'jar', '#9cc7cf', '#f2f2f2'], ['Best Sellers', 'الأكثر مبيعاً', '/best-sellers', 'palette', '#c98b6b', '#f2f2f2'],
  ['Brushes', 'الفرش', '/c/makeup-brushes', 'brush', '#2a2a2a', '#f2f2f2'], ['Fragrances', 'العطور', '/c/fragrances', 'perfume', '#e8cfa8', '#f2f2f2'], ['Offers', 'العروض', '/sale', 'nail', '#b3172f', '#f2f2f2']];
circles.forEach(([te, ta, link, kind, color, bg], i) => insert('banners', { placement: 'circle', title_en: te, title_ar: ta, link, bg, sort: i, image: save(`circle-${i + 1}.svg`, productSVG(kind, color, { bg, ...(kind === 'brush' ? { head: 'round' } : {}) })) }));

const cards = [
  ['Desert Rose', 'وردة الصحراء', 'Rosy nudes', 'نود وردي', '/c/desert-rose', '#ebe8e4', [{ kind: 'lipstick', color: '#a8503c', x: 10, y: 120, s: 0.75 }, { kind: 'compact', color: '#c78f63', x: 230, y: 70, s: 0.6 }, { kind: 'palette', color: '#c98b6b', x: 120, y: 300, s: 0.62 }]],
  ['Golden Hour', 'الساعة الذهبية', 'Warm bronze glow', 'توهج برونزي دافئ', '/c/golden-hour', '#e9e5de', [{ kind: 'compact', color: '#c78f63', x: 20, y: 90, s: 0.7 }, { kind: 'perfume', color: '#f3d27a', x: 250, y: 170, s: 0.62 }, { kind: 'foundation', color: '#d6ab88', x: 60, y: 330, s: 0.55 }]],
  ['Velvet Nights', 'ليالٍ مخملية', 'Deep berries & plums', 'درجات توتية وبنفسجية', '/c/velvet-nights', '#111111', [{ kind: 'liquid', color: '#6c1d33', x: 20, y: 110, s: 0.72 }, { kind: 'perfume', color: '#b36a3c', x: 250, y: 60, s: 0.62, opts: { capColor: '#151515' } }, { kind: 'palette', color: '#6e3a52', x: 110, y: 330, s: 0.6, opts: { colors: ['#d8b4c4', '#a86a8a', '#7a3a5e', '#4e2340', '#2a1a24', '#c58fa8', '#8c2f4f', '#5c2a3a', '#151515'] } }]],
  ['Spring Bloom', 'تفتّح الربيع', 'Fresh corals & citrus', 'درجات مرجانية منعشة وحمضيات', '/c/spring-bloom', '#f2f2f2', [{ kind: 'stick', color: '#f0614f', x: 0, y: 140, s: 0.72 }, { kind: 'gloss', color: '#f2e6e6', x: 250, y: 60, s: 0.66 }, { kind: 'perfume', color: '#f3d27a', x: 150, y: 320, s: 0.55 }]],
];
cards.forEach(([te, ta, se, sa, link, bg, items], i) => insert('banners', { placement: 'card', title_en: te, title_ar: ta, sub_en: se, sub_ar: sa, cta_en: 'Shop now', cta_ar: 'تسوّق الآن', link, bg, sort: i, image: art(`card-${i + 1}.svg`, items, { w: 600, h: 800 }) }));

[['Video tutorials', 'دروس فيديو', 'Step-by-step looks from our artists', 'إطلالات خطوة بخطوة من خبرائنا', 'Watch', 'شاهد', '/page/beauty-services', '#f5f5f5'],
  ['Online consultation', 'استشارة أونلاين', 'Chat with a beauty advisor on WhatsApp', 'تحدث مع خبيرة تجميل عبر واتساب', 'Start a chat', 'ابدأ المحادثة', 'https://wa.me/970590000000', '#f5f5f5'],
  ['Makeup for occasions', 'مكياج المناسبات', 'Weddings, graduations and every celebration', 'أعراس وتخرّج وكل المناسبات', 'Book now', 'احجز الآن', '/page/beauty-services', '#f5f5f5'],
].forEach(([te, ta, se, sa, ce, ca, link, bg], i) => insert('banners', { placement: 'service', title_en: te, title_ar: ta, sub_en: se, sub_ar: sa, cta_en: ce, cta_ar: ca, link, bg, sort: i }));

insert('banners', { placement: 'promo', title_en: 'Free delivery over ₪200', title_ar: 'توصيل مجاني فوق 200 ₪', sub_en: 'To the West Bank and Jerusalem — pay cash on delivery.', sub_ar: 'إلى الضفة الغربية والقدس — والدفع عند الاستلام.', cta_en: 'Shop best sellers', cta_ar: 'تسوّق الأكثر مبيعاً', link: '/best-sellers', bg: '#000000',
  image: art('promo-1.svg', [{ kind: 'bag', color: '#e9e5de', x: 40, y: 120, s: 0.8 }, { kind: 'perfume', color: '#e8cfa8', x: 380, y: 40, s: 0.85 }, { kind: 'lipstick', color: '#b3172f', x: 640, y: 150, s: 0.6 }], { w: 900, h: 600, circle: { x: 450, y: 320, r: 270, fill: '#ffffff', o: 0.08 } }) });

[['Best Sellers', 'الأكثر مبيعاً', 'bestseller'], ['Desert Rose', 'مجموعة وردة الصحراء', 'cat:desert-rose'], ['New In', 'وصل حديثاً', 'new'], ['Special Offers', 'عروض خاصة', 'sale'], ['Skincare Favourites', 'مفضلات العناية', 'cat:skincare']]
  .forEach(([te, ta, source], i) => insert('sections', { title_en: te, title_ar: ta, source, limit_n: 12, sort: i }));

// ---------- information pages ----------
const PAGES = [
  ['about', 'About us', 'من نحن', 1, 0,
    'Kiko Palestine is an online beauty store from Palestine. We bring you makeup, skincare and fragrances we love — with honest advice, fair prices and fast delivery to your door.\n\nOur team is based in Ramallah. Every order is packed with care and delivered by trusted couriers across the West Bank, Jerusalem and the 48 areas.\n\nQuestions? Message us on WhatsApp — a real person will answer.',
    'كيكو فلسطين متجر جمال إلكتروني من فلسطين. نقدّم لك منتجات المكياج والعناية والعطور التي نحبها — مع نصيحة صادقة وأسعار عادلة وتوصيل سريع حتى باب بيتك.\n\nفريقنا في رام الله. نجهّز كل طلب بعناية ونوصله عبر شركات توصيل موثوقة في الضفة الغربية والقدس والداخل.\n\nلديك سؤال؟ راسلنا على واتساب — وسيجيبك شخص حقيقي.'],
  ['shipping', 'Delivery & returns', 'التوصيل والإرجاع', 1, 0,
    '<h3>Delivery</h3><ul><li>West Bank: ₪20 — 1–3 working days</li><li>Jerusalem: ₪30 — 2–3 working days</li><li>Inside (48 areas): ₪70 — 3–5 working days</li></ul><p>Free delivery on orders over ₪200 (₪400 for the 48 areas). Our courier calls you before delivery.</p><h3>Payment</h3><p>Pay cash on delivery, or by card when available at checkout.</p><h3>Returns</h3><p>Unopened products in their original packaging can be returned within 14 days. For hygiene reasons, opened makeup and skincare cannot be returned unless faulty. Contact us to arrange a return.</p>',
    '<h3>التوصيل</h3><ul><li>الضفة الغربية: 20 ₪ — 1–3 أيام عمل</li><li>القدس: 30 ₪ — 2–3 أيام عمل</li><li>الداخل (أراضي 48): 70 ₪ — 3–5 أيام عمل</li></ul><p>توصيل مجاني للطلبات فوق 200 ₪ (400 ₪ للداخل). يتصل بك المندوب قبل التوصيل.</p><h3>الدفع</h3><p>الدفع نقداً عند الاستلام، أو بالبطاقة عند توفرها في صفحة الطلب.</p><h3>الإرجاع</h3><p>يمكن إرجاع المنتجات غير المفتوحة في عبوتها الأصلية خلال 14 يوماً. لأسباب صحية لا يمكن إرجاع المكياج ومنتجات العناية المفتوحة إلا إذا كانت معيبة. تواصل معنا لترتيب الإرجاع.</p>'],
  ['faq', 'FAQ', 'الأسئلة الشائعة', 1, 0,
    '<h3>Are your products original?</h3><p>Yes. We only sell products sourced from authorised suppliers.</p><h3>How long does delivery take?</h3><p>1–3 working days in the West Bank, 2–3 in Jerusalem and 3–5 to the 48 areas.</p><h3>Can I change or cancel my order?</h3><p>Yes, as long as it has not been shipped. Call or WhatsApp us with your order number.</p><h3>How do I track my order?</h3><p>Use the “Track your order” page with your order number and mobile number.</p>',
    '<h3>هل منتجاتكم أصلية؟</h3><p>نعم. نبيع فقط منتجات من موردين معتمدين.</p><h3>كم يستغرق التوصيل؟</h3><p>1–3 أيام عمل في الضفة، 2–3 في القدس و3–5 للداخل.</p><h3>هل يمكنني تعديل الطلب أو إلغاؤه؟</h3><p>نعم، ما دام لم يُشحن بعد. اتصل بنا أو راسلنا على واتساب مع رقم الطلب.</p><h3>كيف أتتبع طلبي؟</h3><p>استخدم صفحة «تتبّع طلبك» مع رقم الطلب ورقم الجوال.</p>'],
  ['beauty-services', 'Beauty services', 'خدمات التجميل', 0, 1,
    'Book a makeup session for your wedding, engagement, graduation or any special day, or get a free online consultation to find your perfect shade.\n\nTo book, message us on WhatsApp with the date, place and the look you have in mind.',
    'احجز جلسة مكياج لعرسك أو خطوبتك أو تخرجك أو أي مناسبة خاصة، أو احصل على استشارة أونلاين مجانية لاختيار الدرجة المثالية لك.\n\nللحجز، راسلنا على واتساب مع التاريخ والمكان والإطلالة التي تحلم بها.'],
  ['privacy', 'Privacy policy', 'سياسة الخصوصية', 1, 0,
    'We collect only the information needed to process your orders (name, phone, address and email) and to improve our service. We never sell your data. Cookies are used to keep your shopping bag, remember your language and keep you signed in. You can ask us at any time to view, correct or delete your data.\n\n(Template text — please review it with a legal adviser before launch.)',
    'نجمع فقط المعلومات اللازمة لتنفيذ طلباتك (الاسم، الهاتف، العنوان والبريد الإلكتروني) ولتحسين خدماتنا. لا نبيع بياناتك أبداً. نستخدم ملفات تعريف الارتباط لحفظ حقيبة التسوق وتذكّر لغتك وإبقائك مسجلاً للدخول. يمكنك أن تطلب منا في أي وقت الاطلاع على بياناتك أو تصحيحها أو حذفها.\n\n(نص نموذجي — يرجى مراجعته مع مستشار قانوني قبل الإطلاق.)'],
  ['terms', 'Terms & conditions', 'الشروط والأحكام', 1, 0,
    'By ordering from this website you agree to these terms. Prices are shown in Israeli shekels (₪) and include VAT where applicable. Orders are confirmed by phone before delivery. We may cancel an order in case of a pricing error or stock problem and will inform you immediately.\n\n(Template text — please review it with a legal adviser before launch.)',
    'بإتمامك الطلب من هذا الموقع فإنك توافق على هذه الشروط. الأسعار معروضة بالشيكل (₪) وتشمل الضريبة حيثما ينطبق. يتم تأكيد الطلبات هاتفياً قبل التوصيل. قد نلغي الطلب في حال وجود خطأ في السعر أو مشكلة في المخزون وسنبلغك فوراً.\n\n(نص نموذجي — يرجى مراجعته مع مستشار قانوني قبل الإطلاق.)'],
  ['accessibility', 'Accessibility', 'إمكانية الوصول', 1, 0,
    'We want everyone to shop comfortably. The site supports keyboard navigation, screen readers, reduced motion settings and both Arabic and English. If something is hard to use, please tell us and we will fix it.',
    'نريد أن يتسوق الجميع براحة. يدعم الموقع التنقل بلوحة المفاتيح وقارئات الشاشة وإعداد تقليل الحركة، باللغتين العربية والإنجليزية. إذا واجهت صعوبة في أي جزء، أخبرنا وسنصلحه.'],
  ['contact', 'Contact us', 'تواصل معنا', 0, 0,
    'We usually reply within a few hours during working days. For the fastest answer, message us on WhatsApp.',
    'نرد عادةً خلال ساعات قليلة في أيام العمل. للحصول على أسرع رد، راسلنا على واتساب.'],
];
PAGES.forEach(([slug, te, ta, footer, menu, be, ba], i) => insert('pages', { slug, title_en: te, title_ar: ta, body_en: be, body_ar: ba, footer, menu, sort: i }));
invalidateContent();
console.log(`✔ Demo content loaded: ${P.length} products, ${Object.keys(CAT).length} categories, banners, pages, zones and coupons.`);
return true;
}

module.exports = { seedDemo };

// Command line: npm run seed  [-- --reset]
if (require.main === module) {
  if (!seedDemo({ reset: process.argv.includes('--reset') })) {
    console.log('The catalog already has products. Run "npm run seed -- --reset" to wipe catalog data (not orders/customers) and re-seed.');
    process.exit(0);
  }
  ensureAdmin().then(() => console.log('  Start the store with: npm start'));
}
