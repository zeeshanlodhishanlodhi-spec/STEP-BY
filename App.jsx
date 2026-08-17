import React, { useState, useEffect, useMemo } from "react";
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, onSnapshot, writeBatch } from "firebase/firestore";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import { db, auth, ADMIN_EMAIL } from "./firebase.js";

// Each product now lives in its OWN Firestore document inside the
// "products" collection (doc id = product id), instead of all products
// being crammed into a single 1MB-limited document as a big array. Same
// idea for orders. This is what fixes photos silently failing to save
// once the catalog grew: with a shared doc, EVERY save had to rewrite
// the entire catalog, and once that combined write crossed Firestore's
// 1MB-per-document limit, saves failed silently — no error shown, and
// the product would look saved on-screen but vanish on reload. With one
// document per product, saving one product only ever writes that one
// small document, so the limit is essentially never hit in normal use.
const productsCol = collection(db, "products");
const ordersCol = collection(db, "orders");

// Product photos are hosted on Cloudinary (free, no card required) instead of
// Firebase Storage (which needs the paid Blaze plan). Cloud name + upload
// preset are public identifiers — safe to keep in client code.
const CLOUDINARY_CLOUD_NAME = "bfs1d0wm";
const CLOUDINARY_UPLOAD_PRESET = "fqeelpp3";

// Serves a resized, auto-compressed version of a Cloudinary image instead of
// the full original — this is the main fix for the site feeling slow: a grid
// of 20 products no longer means 20 full-size photos downloading at once.
// Non-Cloudinary URLs (e.g. old Firebase links, Unsplash placeholders) are
// returned unchanged.
const cldThumb = (url, width = 500) => {
  if (!url || typeof url !== "string" || !url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/f_auto,q_auto,w_${width}/`);
};

/* ---------- Brand asset ---------- */
const LOGO = "data:image/png;base64,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";

/* ---------- Styles (matches the STEPBY brand: black / gold / cream) ---------- */
const CSS = `
.sb *{box-sizing:border-box}
.sb{--black:#111111;--gold:#b98232;--gold2:#d3a45d;--white:#ffffff;--muted:#777777;--line:#e8e8e8;--cream:#f7f3ec;
  font-family:Arial,Helvetica,sans-serif;color:var(--black);background:#fff;-webkit-font-smoothing:antialiased;}
.sb a{text-decoration:none;color:inherit}
.sb button,.sb input,.sb select,.sb textarea{font:inherit}
.sb button{cursor:pointer}
.sb img{max-width:100%;display:block}

/* Header */
.sb-header{position:sticky;top:0;z-index:200;background:#fff;border-bottom:1px solid var(--line)}
.sb-header-top{max-width:1500px;margin:0 auto;padding:14px 22px 14px 0;display:flex;align-items:center;gap:22px;min-height:84px}
.sb-brand{display:flex;align-items:center;gap:0;flex-shrink:0;order:1}
.sb-brand img{height:64px;width:auto;object-fit:contain}
.sb-nav{display:flex;gap:26px;flex:1;justify-content:center;order:2}
.sb-nav button{background:none;border:0;font-size:11px;font-weight:700;letter-spacing:1.4px;padding:8px 0;border-bottom:2px solid transparent;color:var(--black);white-space:nowrap}
.sb-nav button.active,.sb-nav button:hover{color:var(--gold);border-color:var(--gold)}
.sb-header-right{display:flex;align-items:center;gap:8px;flex-shrink:0;order:3}
.sb-icon-btn{background:none;border:0;font-size:20px;line-height:1;width:42px;height:42px;display:grid;place-items:center;border-radius:4px;position:relative;color:var(--black)}
.sb-icon-btn:hover{background:var(--cream)}
.sb-cart-count{position:absolute;top:2px;right:2px;background:var(--gold);color:#fff;border-radius:50%;width:16px;height:16px;font-size:9px;font-weight:700;display:grid;place-items:center}
.sb-footer-admin-link{font-size:10px;font-weight:700;letter-spacing:1px;color:#777;background:none;border:0;padding:0}
.sb-footer-admin-link:hover{color:var(--gold2)}
.sb-mobile-toggle{display:none;order:4}

@media(max-width:980px){
  .sb-nav{display:none}
  .sb-mobile-toggle{display:grid;place-items:center;width:42px;height:42px;border:0;background:none}
  .sb-mobile-toggle span{display:block;width:24px;height:16px;border-top:2px solid var(--black);border-bottom:2px solid var(--black);position:relative}
  .sb-mobile-toggle span::after{content:"";position:absolute;left:0;right:0;top:6px;border-top:2px solid var(--black)}
  .sb-header-top{padding:10px 14px;gap:10px}
  .sb-brand img{height:48px}
  .sb-header-right{margin-left:auto}
}

/* Mobile menu */
.sb-mobile-menu{position:fixed;z-index:400;left:0;top:0;width:300px;max-width:85%;height:100%;background:#fff;padding:24px;transform:translateX(-101%);transition:.3s;box-shadow:2px 0 18px #0002}
.sb-mobile-menu.open{transform:none}
.sb-mobile-backdrop{position:fixed;inset:0;background:#0008;z-index:390;opacity:0;visibility:hidden;transition:.25s}
.sb-mobile-backdrop.open{opacity:1;visibility:visible}
.sb-mobile-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px}
.sb-mobile-head img{height:42px}
.sb-mobile-head button{border:0;background:none;font-size:24px}
.sb-mobile-menu a,.sb-mobile-menu button.mlink{display:block;width:100%;text-align:left;padding:15px 0;border-bottom:1px solid var(--line);font-size:12px;font-weight:700;letter-spacing:1px;background:none;border-left:0;border-right:0;border-top:0}
.sb-mobile-menu .admin-m{margin-top:14px;color:var(--gold);border-top:2px solid var(--gold);padding-top:18px}

/* Hero */
.sb-hero{min-height:600px;display:flex;align-items:center;background:linear-gradient(90deg,#000c,#0006,#0001),url("https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1800&q=80") center/cover}
.sb-hero-inner{width:1200px;max-width:90%;margin:auto;color:#fff}
.sb-eyebrow{font-size:11px;letter-spacing:3px;font-weight:700}
.sb-eyebrow.gold{color:var(--gold)}
.sb-hero h1{font-size:clamp(40px,7vw,86px);line-height:.96;letter-spacing:-3px;margin:18px 0;font-weight:800}
.sb-hero h1 span{color:var(--gold2)}
.sb-hero-text{max-width:520px;color:#ddd;line-height:1.7;font-size:14px}
.sb-hero-actions{display:flex;gap:12px;margin-top:28px;flex-wrap:wrap}
.sb-btn{display:inline-flex;align-items:center;justify-content:center;min-width:170px;height:50px;padding:0 20px;font-size:11px;font-weight:700;letter-spacing:1.4px;border:1px solid #fff;background:none;color:#fff}
.sb-btn-gold{background:var(--gold);border-color:var(--gold);color:#fff}
.sb-btn-gold:hover{background:#fff;color:#111;border-color:#fff}
.sb-btn-outline:hover{background:#fff;color:#111}
.sb-btn-dark{border-color:#111;background:#111;color:#fff}
.sb-btn-dark:hover{opacity:.85}

/* Sections */
.sb-section{max-width:1400px;margin:auto;padding:70px 24px}
.sb-section-heading{text-align:center;margin-bottom:36px}
.sb-section-heading h2{font-size:34px;letter-spacing:-1px;margin:8px 0;font-weight:800}
.sb-section-heading p:last-child{font-size:14px;color:#777}

.sb-cat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.sb-cat-card{height:420px;position:relative;overflow:hidden;background:#ddd;border:0}
.sb-cat-card img{width:100%;height:100%;object-fit:cover;transition:.5s}
.sb-cat-card:hover img{transform:scale(1.06)}
.sb-cat-card::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 40%,#000b)}
.sb-cat-card>div{position:absolute;z-index:2;bottom:24px;left:24px;color:#fff;text-align:left}
.sb-cat-card h3{font-size:24px;font-weight:800}
.sb-cat-card span{font-size:10px;letter-spacing:1.4px;display:block;margin-top:6px}

.sb-tabs{display:flex;justify-content:center;gap:26px;margin-bottom:32px;flex-wrap:wrap}
.sb-tabs button{border:0;background:none;padding:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1px;border-bottom:2px solid transparent;color:var(--black)}
.sb-tabs button.active,.sb-tabs button:hover{border-color:var(--gold);color:var(--gold)}

.sb-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.sb-product{position:relative}
.sb-product-image{position:relative;aspect-ratio:3/4;background:#f3f3f3;overflow:hidden}
.sb-product-image img{width:100%;height:100%;object-fit:cover;transition:.4s}
.sb-product:hover .sb-product-image img{transform:scale(1.05)}
.sb-badge{position:absolute;left:10px;top:10px;z-index:2;background:#111;color:#fff;font-size:9px;padding:6px 9px;letter-spacing:1px;font-weight:700}
.sb-badge.sale{background:var(--gold)}
.sb-img-soldout{filter:grayscale(60%);opacity:.55}
.sb-soldout-badge{position:absolute;right:10px;top:10px;z-index:2;background:#b00020;color:#fff;font-size:9px;padding:6px 9px;letter-spacing:1px;font-weight:700}
.sb-soldout-text{color:#b00020;font-size:11px;font-weight:700;letter-spacing:.6px;margin-top:2px}
.sb-product-image img{cursor:zoom-in}
.sb-lightbox-box{margin:auto;position:relative;max-width:94vw;max-height:90vh;display:flex}
.sb-lightbox-box img{max-width:94vw;max-height:90vh;object-fit:contain;background:#111}
.sb-lightbox-close{position:absolute;top:-38px;right:0;color:#fff;font-size:30px}
.sb-lightbox-nav{position:absolute;top:50%;transform:translateY(-50%);background:#0007;color:#fff;border:0;width:40px;height:40px;font-size:24px;display:grid;place-items:center;border-radius:50%}
.sb-lightbox-nav.prev{left:10px}
.sb-lightbox-nav.next{right:10px}
.sb-lightbox-count{position:absolute;bottom:-30px;left:50%;transform:translateX(-50%);color:#fff;font-size:12px;letter-spacing:.6px}
.sb-quick-add{position:absolute;bottom:10px;left:10px;right:10px;border:0;background:#fff;padding:12px;font-size:10px;font-weight:700;letter-spacing:1px;opacity:0;transform:translateY(8px);transition:.25s}
.sb-product:hover .sb-quick-add{opacity:1;transform:none}
.sb-quick-add:disabled{background:#ccc;cursor:not-allowed}
.sb-product-info{padding:12px 2px}
.sb-product-cat{color:#999;font-size:9px;letter-spacing:1px;text-transform:uppercase}
.sb-product-name{font-size:13px;font-weight:700;margin-top:5px}
.sb-price{font-size:13px;font-weight:700;margin-top:7px}
.sb-old{color:#aaa;text-decoration:line-through;font-weight:400;margin-left:6px}
.sb-empty-msg{text-align:center;color:#888;padding:60px 0;grid-column:1/-1}

.sb-sale-banner{background:#111;color:#fff;text-align:center;padding:80px 20px}
.sb-sale-banner h2{font-size:clamp(38px,6vw,68px);line-height:1;margin:14px 0 18px;letter-spacing:-3px;font-weight:800}
.sb-sale-banner p:not(.sb-eyebrow){color:#aaa;font-size:14px;line-height:1.7;margin:0 auto 26px;max-width:540px}

.sb-benefits{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--line);border-top:1px solid var(--line)}
.sb-benefits>div{text-align:center;padding:32px 14px;border-right:1px solid var(--line)}
.sb-benefits>div:last-child{border-right:0}
.sb-benefit-icon{display:flex;align-items:center;justify-content:center;color:var(--gold);margin-bottom:10px}
.sb-benefits strong{display:block;font-size:11px;letter-spacing:1px}
.sb-benefits small{display:block;color:#888;font-size:11px;margin-top:8px}

.sb-newsletter{text-align:center;background:var(--cream);padding:70px 20px}
.sb-newsletter h2{font-size:32px;margin:8px 0;font-weight:800}
.sb-newsletter p:not(.sb-eyebrow){color:#777;font-size:14px;margin-bottom:22px}
.sb-newsletter form{display:flex;max-width:500px;margin:auto}
.sb-newsletter input{flex:1;border:1px solid #ccc;padding:14px;outline:0}
.sb-newsletter button{border:0;background:#111;color:#fff;padding:0 22px;font-size:11px;font-weight:700;letter-spacing:1px}

.sb-footer{background:#111;color:#fff;padding:60px 24px 22px}
.sb-footer-grid{max-width:1400px;margin:auto;display:grid;grid-template-columns:2fr repeat(3,1fr);gap:40px}
.sb-footer-logo{height:70px;filter:brightness(0) invert(1);margin-bottom:16px}
.sb-footer-grid p{max-width:320px;color:#999;font-size:13px;line-height:1.7}
.sb-footer-grid h4{font-size:11px;letter-spacing:1.5px;margin-bottom:16px}
.sb-footer-grid a{display:block;color:#999;font-size:12px;margin:9px 0}
.sb-footer-grid a:hover{color:var(--gold2)}
.sb-copyright{max-width:1400px;margin:40px auto 0;border-top:1px solid #333;padding-top:16px;color:#666;font-size:10px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}

/* Overlays */
.sb-overlay{position:fixed;inset:0;background:#0009;z-index:500;opacity:0;visibility:hidden;transition:.25s;display:flex}
.sb-overlay.open{opacity:1;visibility:visible}
.sb-cart-drawer{margin-left:auto;height:100%;width:420px;max-width:94%;background:#fff;display:flex;flex-direction:column;transform:translateX(101%);transition:.3s}
.sb-overlay.open .sb-cart-drawer{transform:none}
.sb-cart-head{padding:22px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
.sb-cart-head button{border:0;background:none;font-size:24px}
.sb-cart-items{flex:1;overflow:auto;padding:18px}
.sb-cart-row{display:grid;grid-template-columns:70px 1fr auto;gap:12px;margin-bottom:18px;align-items:start}
.sb-cart-row img{width:70px;height:85px;object-fit:cover}
.sb-cart-row h4{font-size:13px}
.sb-cart-row p{font-size:11px;color:#777;margin-top:5px}
.sb-qty{display:flex;align-items:center;gap:8px;margin-top:8px}
.sb-qty button{width:22px;height:22px;border:1px solid var(--line);background:#fff;font-size:12px;line-height:1}
.sb-remove{border:0;background:none;color:#999;font-size:10px;margin-top:8px;text-decoration:underline}
.sb-cart-empty{text-align:center;color:#888;padding:60px 20px}
.sb-cart-footer{padding:22px;border-top:1px solid var(--line)}
.sb-cart-total{display:flex;justify-content:space-between;margin-bottom:16px;font-weight:700}
.sb-checkout{width:100%;border:0;background:#111;color:#fff;padding:15px;font-size:11px;font-weight:700;letter-spacing:1px}
.sb-checkout:disabled{background:#ccc;cursor:not-allowed}

.sb-modal-box{margin:auto;background:#fff;max-width:92%;width:460px;max-height:88vh;overflow:auto;padding:28px;transform:translateY(14px);transition:.25s}
.sb-overlay.open .sb-modal-box{transform:none}
.sb-modal-box h3{font-size:18px;margin-bottom:4px;font-weight:800}
.sb-close-x{float:right;border:0;background:none;font-size:22px;line-height:1;margin-top:-6px}
.sb-form-row{margin-bottom:14px}
.sb-form-row label{display:block;font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:6px;color:#333}
.sb-form-row input,.sb-form-row select,.sb-form-row textarea{width:100%;border:1px solid #ccc;padding:11px;outline:0;font-size:13px}
.sb-form-row input:focus,.sb-form-row select:focus,.sb-form-row textarea:focus{border-color:var(--gold)}
.sb-form-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sb-error-text{color:#c0392b;font-size:12px;margin-top:10px}
.sb-status-text{font-size:12px;margin-top:12px;color:var(--gold)}

.sb-toast{position:fixed;bottom:22px;right:22px;background:#111;color:#fff;padding:13px 18px;font-size:12px;z-index:800;transform:translateY(24px);opacity:0;pointer-events:none;transition:.25s;max-width:280px}
.sb-toast.show{transform:none;opacity:1}

/* Admin */
.sb-admin-wrap{min-height:100vh;background:var(--cream)}
.sb-admin-login{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#111;padding:20px}
.sb-login-card{background:#fff;padding:40px 34px;width:380px;max-width:92vw}
.sb-login-card img{height:56px;margin:0 auto 18px;display:block}
.sb-login-card h2{text-align:center;font-size:18px;margin-bottom:6px;letter-spacing:.5px}
.sb-login-card>p{text-align:center;color:#888;font-size:12px;margin-bottom:26px}
.sb-login-hint{background:var(--cream);border:1px dashed var(--gold);padding:10px 12px;font-size:11px;color:#555;margin-top:16px}
.sb-admin-bar{background:#111;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:14px 24px}
.sb-admin-bar-left{display:flex;align-items:center;gap:14px}
.sb-admin-bar img{height:32px;filter:brightness(0) invert(1)}
.sb-admin-bar-title{font-size:12px;font-weight:700;letter-spacing:1px}
.sb-admin-bar button{border:1px solid #555;background:none;color:#fff;padding:9px 16px;font-size:11px;letter-spacing:.5px}
.sb-admin-bar button:hover{border-color:var(--gold);color:var(--gold)}
.sb-admin-body{max-width:1200px;margin:auto;padding:30px 24px 70px}
.sb-admin-tabs{display:flex;gap:8px;margin-bottom:26px;flex-wrap:wrap}
.sb-admin-tabs button{border:1px solid var(--line);background:#fff;padding:11px 18px;font-size:11px;font-weight:700;letter-spacing:.6px}
.sb-admin-tabs button.active{background:#111;color:#fff;border-color:#111}
.sb-admin-card{background:#fff;border:1px solid var(--line);padding:22px;margin-bottom:20px}
.sb-admin-card h3{font-size:15px;margin-bottom:16px}
.sb-table{width:100%;border-collapse:collapse}
.sb-table th{text-align:left;font-size:10px;letter-spacing:.6px;color:#888;border-bottom:1px solid var(--line);padding:10px 8px}
.sb-table td{padding:10px 8px;border-bottom:1px solid var(--line);font-size:12px;vertical-align:middle}
.sb-table img{width:38px;height:46px;object-fit:cover}
.sb-tag{display:inline-block;font-size:10px;padding:4px 8px;border-radius:3px;background:var(--cream);border:1px solid var(--line)}
.sb-tag.out{background:#fde;color:#b00;border-color:#fbb}
.sb-mini-btn{border:1px solid var(--line);background:#fff;padding:6px 10px;font-size:10px;margin-right:6px}
.sb-mini-btn:hover{border-color:var(--gold);color:var(--gold)}
.sb-mini-btn.danger:hover{border-color:#c0392b;color:#c0392b}
.sb-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
.sb-stat{background:#fff;border:1px solid var(--line);padding:20px}
.sb-stat span{display:block;font-size:10px;letter-spacing:1px;color:#888;margin-bottom:8px}
.sb-stat strong{font-size:24px}

@media(max-width:900px){
  .sb-cat-grid{grid-template-columns:repeat(2,1fr)}
  .sb-grid{grid-template-columns:repeat(2,1fr)}
  .sb-footer-grid{grid-template-columns:repeat(2,1fr)}
  .sb-benefits{grid-template-columns:repeat(2,1fr)}
  .sb-benefits>div{border-bottom:1px solid var(--line)}
  .sb-form-two{grid-template-columns:1fr}
  .sb-stat-grid{grid-template-columns:repeat(2,1fr)}
  .sb-admin-body{padding:22px 14px 60px}
}
@media(max-width:520px){
  .sb-cat-card{height:260px}
  .sb-hero{min-height:520px}
  .sb-admin-bar{padding:12px 14px;flex-wrap:wrap;gap:10px}
}
`;

/* ---------- Seed data ---------- */
const CATEGORY_IMAGES = {
  Men: "https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?auto=format&fit=crop&w=900&q=80",
  Women: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
  Boys: "https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?auto=format&fit=crop&w=900&q=80",
  Girls: "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&w=900&q=80",
};

// IDs must stay unique FOREVER, across every browser session — not just
// within one page load. A simple incrementing counter (the old approach)
// resets to the same starting number every time the page reloads, so the
// first new product added in any session would always get the same ID as
// the first new product added in any other session. Since saving a
// product writes straight to products/{id}, two different products
// sharing an ID meant the newer one would silently overwrite (destroy)
// the older one — including its photo. This is why products/photos kept
// disappearing. Timestamp + random suffix makes a collision astronomically
// unlikely, even for products created in the same millisecond.
const nextId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const seedProducts = [
  { id: nextId(), name: "Tailored Wool Blazer", category: "Men", price: 12900, old: 15900, img: "https://images.unsplash.com/photo-1593032465175-481ac7f401a0?auto=format&fit=crop&w=800&q=80", badge: "SALE", sizes: ["S","M","L","XL"], colors: ["Black","Navy"], stock: 10, inStock: true },
  { id: nextId(), name: "Classic Oxford Shirt", category: "Men", price: 4900, old: "", img: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=800&q=80", badge: "NEW", sizes: ["S","M","L","XL"], colors: ["White","Blue"], stock: 10, inStock: true },
  { id: nextId(), name: "Silk Wrap Dress", category: "Women", price: 8900, old: 10900, img: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80", badge: "SALE", sizes: ["XS","S","M","L"], colors: ["Rose","Black"], stock: 10, inStock: true },
  { id: nextId(), name: "Structured Trench Coat", category: "Women", price: 13900, old: "", img: "https://images.unsplash.com/photo-1520975954732-35dd22299614?auto=format&fit=crop&w=800&q=80", badge: "NEW", sizes: ["S","M","L"], colors: ["Camel"], stock: 10, inStock: true },
  { id: nextId(), name: "Denim Jacket Junior", category: "Boys", price: 3900, old: "", img: "https://images.unsplash.com/photo-1519457851160-6cee74a72336?auto=format&fit=crop&w=800&q=80", badge: "", sizes: ["4-5Y","6-7Y","8-9Y"], colors: ["Blue"], stock: 10, inStock: true },
  { id: nextId(), name: "Graphic Tee Set", category: "Boys", price: 2400, old: 2900, img: "https://images.unsplash.com/photo-1622290291468-a28f7a7dc6a8?auto=format&fit=crop&w=800&q=80", badge: "SALE", sizes: ["4-5Y","6-7Y","8-9Y"], colors: ["Grey","White"], stock: 10, inStock: true },
  { id: nextId(), name: "Floral Party Dress", category: "Girls", price: 3600, old: "", img: "https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?auto=format&fit=crop&w=800&q=80", badge: "NEW", sizes: ["4-5Y","6-7Y","8-9Y"], colors: ["Pink"], stock: 10, inStock: true },
  { id: nextId(), name: "Everyday Pinafore", category: "Girls", price: 2900, old: "", img: "https://images.unsplash.com/photo-1622290291418-2d8c1a3d3b0e?auto=format&fit=crop&w=800&q=80", badge: "", sizes: ["4-5Y","6-7Y","8-9Y"], colors: ["Mustard"], stock: 0, inStock: false },
];

const money = (n) => "PKR " + Number(n || 0).toLocaleString("en-PK");
const FILTERS = ["All", "Men", "Women", "Boys", "Girls"];

/* ---------- Simple line icons (no emoji) ---------- */
const IconSearch = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);
const IconCart = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1.4" /><circle cx="18" cy="21" r="1.4" /><path d="M2.5 3h2l2.6 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6" /></svg>
);
const IconTruck = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="6" width="14" height="11" /><path d="M15 10h4l3 3v4h-7z" /><circle cx="6" cy="19" r="1.6" /><circle cx="17.5" cy="19" r="1.6" /></svg>
);
const IconLock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="10" rx="1.5" /><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3" /></svg>
);
const IconReturn = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h11a5 5 0 0 1 0 10H9" /><polyline points="7 4 3 8 7 12" /></svg>
);
const IconStar = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.1 8.6 22 9.6 17 14.6 18.2 21.5 12 18.2 5.8 21.5 7 14.6 2 9.6 8.9 8.6" /></svg>
);

function StepbyApp() {
  const [page, setPage] = useState("store"); // store | admin
  const [products, setProducts] = useState(seedProducts);
  const [filter, setFilter] = useState("All");
  const [cart, setCart] = useState([]); // {id,size,color,qty}
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [lightbox, setLightbox] = useState(null); // { images: [...], index: 0 } | null

  // Admin auth — real, server-side auth via Firebase Authentication.
  // No password is ever stored in Firestore or compared in the browser.
  const [adminUser, setAdminUser] = useState(null);
  const adminLoggedIn = !!adminUser;
  const [authReady, setAuthReady] = useState(false);
  const [loginForm, setLoginForm] = useState({ password: "" });
  const [loginError, setLoginError] = useState("");
  const [adminTab, setAdminTab] = useState("products"); // products | orders | settings
  const [productForm, setProductForm] = useState(null); // null = closed, {} = new, obj = editing
  const [imgUploading, setImgUploading] = useState(false);
  const [imgUploadProgress, setImgUploadProgress] = useState(null); // { done, total }
  const [passForm, setPassForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passMsg, setPassMsg] = useState("");
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Shared data (products/orders) lives in Firestore so it persists across
  // visitors and survives redeploys. Cart stays in this browser's
  // localStorage since it's per-visitor and doesn't need a backend.
  const fsDoc = (key) => doc(db, "stepby", key);

  // Firebase keeps track of the signed-in admin itself (server-verified);
  // we just mirror that state here.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAdminUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Only a signed-in admin is allowed to read the orders list (see
  // firestore.rules), so fetch it once we know who's signed in.
  useEffect(() => {
    if (!adminUser) return;
    let cancelled = false;
    let unsub;
    (async () => {
      // Same one-time migration as products: move any legacy orders out
      // of the old single "stepby/orders" document into their own
      // documents, so a long order history can never hit the same
      // silent-save-failure bug.
      try {
        const existing = await getDocs(ordersCol);
        if (existing.empty) {
          const legacy = await getDoc(fsDoc("orders"));
          const legacyValue = legacy.exists() ? legacy.data().value : undefined;
          if (Array.isArray(legacyValue) && legacyValue.length) {
            for (let i = 0; i < legacyValue.length; i += 400) {
              const batch = writeBatch(db);
              legacyValue.slice(i, i + 400).forEach((o) => batch.set(doc(ordersCol, String(o.id)), o));
              try { await batch.commit(); } catch (e) { console.error("Order migration failed", e); }
            }
          }
        }
      } catch (e) { console.error("Order collection check failed", e); }
      if (cancelled) return;
      unsub = onSnapshot(
        ordersCol,
        (snap) => {
          const list = snap.docs.map((d) => d.data());
          list.sort((a, b) => (b.id > a.id ? 1 : -1));
          if (!cancelled) setOrders(list);
        },
        (e) => { console.error("Firestore live-load failed for orders", e); }
      );
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUser]);

  useEffect(() => {
    document.title = "STEPBY — Step Into Style";
    try {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
      link.href = LOGO;
    } catch (e) {}
  }, []);

  // Live-sync products from Firestore. onSnapshot keeps an open connection,
  // so the moment ANY device (phone, laptop, any deployment on this same
  // Firebase project) saves a product, every other open storefront/admin
  // panel receives the update automatically — no refresh needed.
  //
  // Before subscribing, do a ONE-TIME migration: if the new "products"
  // collection is still empty, this Firebase project either (a) has an
  // old catalog sitting in the legacy single "stepby/products" document
  // from before this restructure, or (b) is brand new and needs seeding.
  // Either way, each product gets written out as its own document.
  useEffect(() => {
    let unsub;
    let cancelled = false;
    (async () => {
      try {
        const existing = await getDocs(productsCol);
        if (existing.empty) {
          let toWrite = seedProducts;
          try {
            const legacy = await getDoc(fsDoc("products"));
            const legacyValue = legacy.exists() ? legacy.data().value : undefined;
            if (Array.isArray(legacyValue) && legacyValue.length) toWrite = legacyValue;
          } catch (e) { console.error("Legacy product catalog read failed", e); }
          // Firestore batches top out at 500 writes, so chunk defensively.
          for (let i = 0; i < toWrite.length; i += 400) {
            const batch = writeBatch(db);
            toWrite.slice(i, i + 400).forEach((p) => batch.set(doc(productsCol, String(p.id)), p));
            try { await batch.commit(); } catch (e) { console.error("Product migration/seed failed", e); }
          }
        }
      } catch (e) { console.error("Product collection check failed", e); }
      if (cancelled) return;
      unsub = onSnapshot(
        productsCol,
        (snap) => { setProducts(snap.docs.map((d) => d.data())); setLoaded(true); },
        (e) => { console.error("Firestore live-load failed for products", e); setLoaded(true); }
      );
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, []);

  // Cart stays per-visitor in this browser's localStorage (loaded once).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("stepby:cart");
      const savedCart = raw ? JSON.parse(raw) : undefined;
      if (Array.isArray(savedCart)) setCart(savedCart);
    } catch (e) { /* ignore */ }
  }, []);

  // Cart is per-visitor and stays in this browser's localStorage only —
  // products and orders now write straight to their own Firestore
  // documents (see saveProduct, deleteProduct, placeOrder below).
  const persist = (key, value) => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.error("Local save failed", key, e); }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2400); };

  const filteredProducts = useMemo(() => {
    let list = filter === "All" ? products : products.filter((p) => p.category === filter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    // In-stock items first; out-of-stock items sink to the bottom, original order kept within each group.
    return [...list].sort((a, b) => {
      const aOut = a.inStock === false ? 1 : 0;
      const bOut = b.inStock === false ? 1 : 0;
      return aOut - bOut;
    });
  }, [products, filter, searchQuery]);

  const addToCart = (product) => {
    if (product.inStock === false) return;
    const size = (product.sizes && product.sizes[0]) || "";
    const color = (product.colors && product.colors[0]) || "";
    const idx = cart.findIndex((c) => c.id === product.id && c.size === size && c.color === color);
    let next;
    if (idx > -1) {
      next = [...cart];
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
    } else {
      next = [...cart, { id: product.id, size, color, qty: 1 }];
    }
    setCart(next);
    persist("stepby:cart", next);
    showToast(product.name + " added to cart");
  };

  const updateQty = (index, delta) => {
    const next = [...cart];
    next[index] = { ...next[index], qty: Math.max(1, next[index].qty + delta) };
    setCart(next);
    persist("stepby:cart", next);
  };
  const removeFromCart = (index) => {
    const next = cart.filter((_, i) => i !== index);
    setCart(next);
    persist("stepby:cart", next);
  };

  const cartLines = cart.map((c) => {
    const product = products.find((p) => p.id === c.id);
    return { ...c, product };
  }).filter((l) => l.product);

  const cartCount = cartLines.reduce((n, l) => n + l.qty, 0);
  const cartTotal = cartLines.reduce((n, l) => n + l.qty * Number(l.product.price || 0), 0);

  const goFilter = (f) => { setFilter(f); setMobileOpen(false); document.getElementById("sb-products")?.scrollIntoView({ behavior: "smooth" }); };

  // Tapping a product's photo opens it full-size instead of adding to cart —
  // uses every uploaded photo for that product so shoppers can flip through
  // them, and works the same for sold-out items (no reason to hide the photo).
  const openLightbox = (p) => {
    const images = (p.images && p.images.length) ? p.images : (p.img ? [p.img] : []);
    if (!images.length) return;
    setLightbox({ images, index: 0, name: p.name });
  };
  const lightboxPrev = () => setLightbox((lb) => lb && { ...lb, index: (lb.index - 1 + lb.images.length) % lb.images.length });
  const lightboxNext = () => setLightbox((lb) => lb && { ...lb, index: (lb.index + 1) % lb.images.length });

  // NOTE: the storefront used to stay hidden behind a blank "LOADING…"
  // screen until BOTH Firestore's product list AND Firebase Auth's login
  // check finished — two separate network round-trips a shopper never
  // needed to wait on, since `products` already starts populated with
  // sample data and the admin login form (below) already handles a
  // signed-out state on its own. Removing that wait is the main fix for
  // the site feeling slow to open: the page now paints immediately and
  // swaps in live data/login state moments later, in place.

  /* ---------- Admin actions ---------- */
  const DEFAULT_PASSWORD = "admin123";
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      // Firebase's own servers verify this — the password never touches
      // Firestore and is never compared here in the browser.
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, loginForm.password);
      setLoginForm({ password: "" });
      return;
    } catch (err) {
      // No admin account created yet? The very first login with the default
      // password creates a real Firebase account on the spot — after that,
      // this only ever runs once, since the account will already exist.
      if (loginForm.password === DEFAULT_PASSWORD) {
        try {
          await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, DEFAULT_PASSWORD);
          setLoginForm({ password: "" });
          return;
        } catch (createErr) {
          console.error("Admin bootstrap failed:", createErr.code || createErr);
          if (createErr.code === "auth/operation-not-allowed") {
            setLoginError("Email/Password sign-in isn't enabled yet in Firebase Console → Authentication → Sign-in method.");
            return;
          }
        }
      }
      console.error("Login failed:", err.code || err);
      setLoginError("Incorrect password.");
    }
  };
  const handleLogout = async () => {
    try { await signOut(auth); } catch (e) { console.error("Logout failed", e); }
    setPage("store"); setAdminTab("products");
  };

  const openNewProduct = () => setProductForm({
    id: null, name: "", category: "Men", price: "", old: "", img: "", images: [], badge: "", sizesText: "", colorsText: "", stock: "10",
  });
  const openEditProduct = (p) => setProductForm({
    id: p.id, name: p.name, category: p.category, price: p.price, old: p.old || "", img: p.img,
    images: p.images && p.images.length ? p.images : (p.img ? [p.img] : []),
    badge: p.badge || "", sizesText: (p.sizes || []).join(", "), colorsText: (p.colors || []).join(", "),
    stock: p.stock !== undefined ? String(p.stock) : (p.inStock === false ? "0" : "10"),
  });

  // Shrinks a photo to a reasonable max size and re-encodes it as a compressed
  // JPEG before it ever leaves the phone. Raw phone camera photos are often
  // 3-10MB each — this typically gets them down to a few hundred KB, which is
  // the single biggest reason uploads used to feel slow on mobile data.
  const compressImage = (file, maxDim = 1600, quality = 0.82) =>
    new Promise((resolve) => {
      // Skip already-small files, and skip anything that isn't a normal
      // browser-decodable image (e.g. some HEIC photos) — those just upload
      // as-is rather than risk breaking the upload.
      if (!file.type || !file.type.startsWith("image/") || file.size < 300 * 1024) {
        resolve(file);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob && blob.size < file.size ? blob : file), "image/jpeg", quality);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file); // fall back to the original file if it can't be decoded
      };
      img.src = objectUrl;
    });

  const handleImageFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setImgUploading(true);
    setImgUploadProgress({ done: 0, total: files.length });
    let done = 0;
    try {
      // Compress + upload every photo in parallel instead of one at a time —
      // order is preserved (Promise.all keeps array order regardless of which
      // finishes first), so "first photo = main image" still works correctly.
      const uploads = files.map(async (file) => {
        const compressed = await compressImage(file);
        const body = new FormData();
        body.append("file", compressed, file.name);
        body.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        body.append("folder", "products");
        const res = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: "POST", body }
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.error?.message || `Upload failed (${res.status})`);
        }
        const data = await res.json();
        done += 1;
        setImgUploadProgress({ done, total: files.length });
        return data.secure_url;
      });
      const uploaded = await Promise.all(uploads);
      setProductForm((f) => {
        const images = [...(f.images || []), ...uploaded];
        return { ...f, images, img: f.img || images[0] };
      });
      showToast(uploaded.length > 1 ? "Images uploaded" : "Image uploaded");
    } catch (err) {
      console.error("Image upload failed:", err.code || err);
      showToast("Image upload failed. Please try again.");
    } finally {
      setImgUploading(false);
      setImgUploadProgress(null);
    }
  };

  const addImageUrl = (url) => {
    const clean = url.trim();
    if (!clean) return;
    setProductForm((f) => {
      const images = [...(f.images || []), clean];
      return { ...f, images, img: f.img || images[0] };
    });
  };

  const removeImage = (idx) => {
    setProductForm((f) => {
      const images = (f.images || []).filter((_, i) => i !== idx);
      return { ...f, images, img: images[0] || "" };
    });
  };

  const saveProduct = async (e) => {
    e.preventDefault();
    const f = productForm;
    const images = f.images || [];
    const built = {
      id: f.id || nextId(),
      name: f.name.trim(),
      category: f.category,
      price: Number(f.price) || 0,
      old: f.old ? Number(f.old) : "",
      img: images[0] || "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=800&q=80",
      images,
      badge: f.badge.trim(),
      sizes: f.sizesText.split(",").map((s) => s.trim()).filter(Boolean),
      colors: f.colorsText.split(",").map((s) => s.trim()).filter(Boolean),
      stock: Math.max(0, Number(f.stock) || 0),
      inStock: (Math.max(0, Number(f.stock) || 0)) > 0,
    };
    // Write this ONE product to its own document — never the whole
    // catalog — and wait for Firestore to confirm before closing the
    // form, so a failed save shows an error instead of silently
    // vanishing after a refresh.
    try {
      await setDoc(doc(productsCol, String(built.id)), built);
    } catch (err) {
      console.error("Firestore save failed for product", built.id, err);
      showToast("Save failed — check your connection and try again.");
      return;
    }
    setProductForm(null);
    showToast("Product saved");
  };

  const deleteProduct = async (id) => {
    try {
      await deleteDoc(doc(productsCol, String(id)));
    } catch (err) {
      console.error("Firestore delete failed for product", id, err);
      showToast("Delete failed — check your connection and try again.");
      return;
    }
    const nextCart = cart.filter((c) => c.id !== id);
    setCart(nextCart);
    persist("stepby:cart", nextCart);
  };

  const handleCredentialsUpdate = async (e) => {
    e.preventDefault();
    setPassMsg("");
    if (!passForm.newPassword || passForm.newPassword.length < 6) { setPassMsg("New password must be at least 6 characters."); return; }
    if (passForm.newPassword !== passForm.confirmPassword) { setPassMsg("New passwords do not match."); return; }
    try {
      // Firebase requires re-proving the current password before allowing a
      // change — this round-trips to Firebase's servers, it isn't a local check.
      const cred = EmailAuthProvider.credential(ADMIN_EMAIL, passForm.currentPassword);
      await reauthenticateWithCredential(adminUser, cred);
      await updatePassword(adminUser, passForm.newPassword);
      setPassForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPassMsg("Password updated successfully.");
    } catch (err) {
      console.error("Password update failed:", err.code || err);
      setPassMsg(err.code === "auth/wrong-password" || err.code === "auth/invalid-credential" ? "Current password is incorrect." : "Something went wrong updating your password.");
    }
  };

  const placeOrder = async (e) => {
    e.preventDefault();
    const formEl = e.target;
    const fd = new FormData(formEl);
    const order = {
      id: "SB" + Date.now().toString().slice(-6),
      name: fd.get("name"), phone: fd.get("phone"), whatsapp: fd.get("whatsapp"), city: fd.get("city"), address: fd.get("address"),
      items: cartLines.map((l) => ({ name: l.product.name, qty: l.qty, size: l.size, color: l.color, price: l.product.price })),
      total: cartTotal, date: new Date().toLocaleString(),
    };
    // Each order is its own document (see the productsCol/ordersCol note
    // near the top of this file) — a checkout customer is never signed
    // in, so this only needs create permission (see firestore.rules),
    // not the ability to read the order back.
    try {
      await setDoc(doc(ordersCol, order.id), order);
    } catch (err) {
      console.error("Firestore save failed for order", order.id, err);
      showToast("Order failed to send — please check your connection and try again.");
      return;
    }

    // Reduce stock for every ordered item; anything that hits 0 automatically
    // flips to Out of Stock and sinks to the bottom of the store (see
    // filteredProducts). Only the affected products are written.
    const orderedQty = {};
    cartLines.forEach((l) => { orderedQty[l.id] = (orderedQty[l.id] || 0) + l.qty; });
    const nextProducts = products.map((p) => {
      if (!orderedQty[p.id]) return p;
      const newStock = Math.max(0, (p.stock !== undefined ? p.stock : 0) - orderedQty[p.id]);
      return { ...p, stock: newStock, inStock: newStock > 0 };
    });
    setProducts(nextProducts);
    try {
      const batch = writeBatch(db);
      nextProducts.forEach((p) => { if (orderedQty[p.id]) batch.set(doc(productsCol, String(p.id)), p); });
      await batch.commit();
    } catch (err) { console.error("Firestore stock update failed", err); }

    setCart([]);
    persist("stepby:cart", []);
    setCheckoutOpen(false);
    setCartOpen(false);
    showToast("Order placed! We will contact you shortly.");
    formEl.reset();
  };

  /* ================= ADMIN VIEW ================= */
  if (page === "admin") {
    if (!adminLoggedIn) {
      return (
        <div className="sb">
          <style>{CSS}</style>
          <div className="sb-admin-login">
            <div className="sb-login-card">
              <img src={LOGO} alt="STEPBY" />
              <h2>ADMIN LOGIN</h2>
              <p>Sign in to manage STEPBY</p>
              <form onSubmit={handleLogin}>
                <div className="sb-form-row">
                  <label>Password</label>
                  <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="••••••••" required autoFocus />
                </div>
                {loginError && <p className="sb-error-text">{loginError}</p>}
                <button className="sb-btn sb-btn-dark" style={{ width: "100%", marginTop: 6 }} type="submit">LOG IN</button>
              </form>
              <button className="sb-mini-btn" style={{ marginTop: 16, width: "100%" }} onClick={() => setPage("store")}>← Back to store</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="sb">
        <style>{CSS}</style>
        <div className="sb-admin-wrap">
          <div className="sb-admin-bar">
            <div className="sb-admin-bar-left">
              <img src={LOGO} alt="STEPBY" />
              <span className="sb-admin-bar-title">ADMIN PANEL</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setPage("store")}>VIEW STORE</button>
              <button onClick={handleLogout}>LOG OUT</button>
            </div>
          </div>

          <div className="sb-admin-body">
            <div className="sb-stat-grid">
              <div className="sb-stat"><span>TOTAL PRODUCTS</span><strong>{products.length}</strong></div>
              <div className="sb-stat"><span>OUT OF STOCK</span><strong>{products.filter(p=>p.inStock===false).length}</strong></div>
              <div className="sb-stat"><span>ORDERS RECEIVED</span><strong>{orders.length}</strong></div>
              <div className="sb-stat"><span>CART VALUE NOW</span><strong>{money(cartTotal)}</strong></div>
            </div>

            <div className="sb-admin-tabs">
              <button className={adminTab==="products"?"active":""} onClick={() => setAdminTab("products")}>PRODUCTS</button>
              <button className={adminTab==="orders"?"active":""} onClick={() => setAdminTab("orders")}>ORDERS</button>
              <button className={adminTab==="settings"?"active":""} onClick={() => setAdminTab("settings")}>LOGIN SETTINGS</button>
            </div>

            {adminTab === "products" && (
              <div className="sb-admin-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ marginBottom: 0 }}>Manage Products</h3>
                  <button className="sb-btn sb-btn-dark" style={{ minWidth: 140, height: 40 }} onClick={openNewProduct}>+ ADD PRODUCT</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="sb-table">
                    <thead><tr><th></th><th>NAME</th><th>CATEGORY</th><th>PRICE</th><th>STOCK</th><th></th></tr></thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id}>
                          <td><img src={cldThumb(p.img, 80)} alt={p.name} loading="lazy" /></td>
                          <td>{p.name}{p.badge ? <span className="sb-tag" style={{ marginLeft: 8 }}>{p.badge}</span> : null}</td>
                          <td>{p.category}</td>
                          <td>{money(p.price)}{p.old ? <span className="sb-old"> {money(p.old)}</span> : null}</td>
                          <td>
                            <span className={"sb-tag" + (p.inStock===false ? " out" : "")}>{p.inStock===false ? "OUT OF STOCK" : "IN STOCK"}</span>
                            <span style={{ fontSize: 11, color: "#888", marginLeft: 6 }}>({p.stock !== undefined ? p.stock : "—"})</span>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button className="sb-mini-btn" onClick={() => openEditProduct(p)}>EDIT</button>
                            <button className="sb-mini-btn danger" onClick={() => deleteProduct(p.id)}>DELETE</button>
                          </td>
                        </tr>
                      ))}
                      {products.length === 0 && <tr><td colSpan="6" style={{ textAlign: "center", padding: 30, color: "#888" }}>No products yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {adminTab === "orders" && (
              <div className="sb-admin-card">
                <h3>Orders</h3>
                {orders.length === 0 && <p style={{ color: "#888", fontSize: 13 }}>No orders placed yet. Orders from checkout will appear here.</p>}
                {orders.map((o) => (
                  <div key={o.id} style={{ borderBottom: "1px solid var(--line)", padding: "14px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
                      <span>#{o.id} — {o.name}</span><span>{money(o.total)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{o.phone} · WhatsApp: {o.whatsapp} · {o.city} · {o.date}</div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>{o.items.map(it => it.name + " ×" + it.qty).join(", ")}</div>
                  </div>
                ))}
              </div>
            )}

            {adminTab === "settings" && (
              <div className="sb-admin-card" style={{ maxWidth: 460 }}>
                <h3>Change Admin Password</h3>
                <form onSubmit={handleCredentialsUpdate}>
                  <div className="sb-form-row"><label>Current password</label><input type="password" required value={passForm.currentPassword} onChange={(e) => setPassForm({ ...passForm, currentPassword: e.target.value })} /></div>
                  <div className="sb-form-two">
                    <div className="sb-form-row"><label>New password</label><input type="password" required value={passForm.newPassword} onChange={(e) => setPassForm({ ...passForm, newPassword: e.target.value })} /></div>
                    <div className="sb-form-row"><label>Confirm new password</label><input type="password" required value={passForm.confirmPassword} onChange={(e) => setPassForm({ ...passForm, confirmPassword: e.target.value })} /></div>
                  </div>
                  {passMsg && <p className={passMsg.includes("success") ? "sb-status-text" : "sb-error-text"}>{passMsg}</p>}
                  <button className="sb-btn sb-btn-dark" style={{ width: "100%", marginTop: 6 }} type="submit">UPDATE LOGIN</button>
                </form>
              </div>
            )}
          </div>
        </div>

        {productForm && (
          <div className="sb-overlay open" onClick={(e) => e.target === e.currentTarget && setProductForm(null)}>
            <div className="sb-modal-box">
              <button className="sb-close-x" onClick={() => setProductForm(null)}>×</button>
              <h3>{productForm.id ? "Edit Product" : "Add Product"}</h3>
              <p style={{ fontSize: 12, color: "#888", marginBottom: 18 }}>Changes appear on the storefront immediately.</p>
              <form onSubmit={saveProduct}>
                <div className="sb-form-row"><label>Product name</label><input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} /></div>
                <div className="sb-form-two">
                  <div className="sb-form-row"><label>Category</label>
                    <select value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                      <option>Men</option><option>Women</option><option>Boys</option><option>Girls</option>
                    </select>
                  </div>
                  <div className="sb-form-row"><label>Badge (optional)</label><input placeholder="NEW / SALE" value={productForm.badge} onChange={(e) => setProductForm({ ...productForm, badge: e.target.value })} /></div>
                </div>
                <div className="sb-form-two">
                  <div className="sb-form-row"><label>Price (PKR)</label><input type="number" required value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} /></div>
                  <div className="sb-form-row"><label>Old price (optional)</label><input type="number" value={productForm.old} onChange={(e) => setProductForm({ ...productForm, old: e.target.value })} /></div>
                </div>
                <div className="sb-form-row">
                  <label>Product photos (choose as many as you like)</label>
                  <input type="file" accept="image/*" multiple onChange={(e) => { handleImageFiles(e.target.files); e.target.value = ""; }} />
                  {imgUploading && (
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                      Uploading{imgUploadProgress ? ` ${imgUploadProgress.done}/${imgUploadProgress.total}` : "…"}
                    </div>
                  )}
                  {(productForm.images || []).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                      {productForm.images.map((url, idx) => (
                        <div key={idx} style={{ position: "relative" }}>
                          <img src={cldThumb(url, 140)} alt={`Photo ${idx + 1}`} loading="lazy" style={{ height: 70, width: 70, borderRadius: 6, objectFit: "cover", border: idx === 0 ? "2px solid var(--gold)" : "1px solid var(--line)" }} />
                          <button type="button" onClick={() => removeImage(idx)}
                            style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", border: "none", background: "#111", color: "#fff", fontSize: 12, lineHeight: "20px", padding: 0, cursor: "pointer" }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(productForm.images || []).length > 0 && <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>First photo (gold border) is used as the main image.</div>}
                </div>
                <div className="sb-form-row"><label>Or paste Image URL</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder="https://..." id="sb-img-url-input" style={{ flex: 1 }} />
                    <button type="button" className="sb-btn sb-btn-dark" onClick={() => {
                      const el = document.getElementById("sb-img-url-input");
                      addImageUrl(el.value); el.value = "";
                    }}>Add</button>
                  </div>
                </div>
                <div className="sb-form-two">
                  <div className="sb-form-row"><label>Sizes (comma separated)</label><input placeholder="S, M, L, XL" value={productForm.sizesText} onChange={(e) => setProductForm({ ...productForm, sizesText: e.target.value })} /></div>
                  <div className="sb-form-row"><label>Colours (comma separated)</label><input placeholder="Black, Navy" value={productForm.colorsText} onChange={(e) => setProductForm({ ...productForm, colorsText: e.target.value })} /></div>
                </div>
                <div className="sb-form-row" style={{ maxWidth: 180 }}>
                  <label>Stock quantity</label>
                  <input type="number" min="0" required value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} />
                  <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>Goes to 0 → product automatically shows as Out of Stock and moves to the bottom of the store.</div>
                </div>
                <button className="sb-btn sb-btn-dark" style={{ width: "100%", marginTop: 6 }} type="submit">SAVE PRODUCT</button>
              </form>
            </div>
          </div>
        )}

        <div className={"sb-toast" + (toast ? " show" : "")}>{toast}</div>
      </div>
    );
  }

  /* ================= STORE VIEW ================= */
  return (
    <div className="sb">
      <style>{CSS}</style>

      <header className="sb-header">
        <div className="sb-header-top">
          <button className="sb-mobile-toggle sb-icon-btn" aria-label="Open menu" onClick={() => setMobileOpen(true)}><span></span></button>
          <a className="sb-brand" href="#top" onClick={(e) => e.preventDefault()}>
            <img src={LOGO} alt="STEPBY — Step Into Style" />
          </a>
          <div className="sb-header-right">
            <button className="sb-icon-btn" aria-label="Search" onClick={() => setSearchOpen(true)}><IconSearch /></button>
            <button className="sb-icon-btn" aria-label="Cart" onClick={() => setCartOpen(true)}>
              <IconCart />{cartCount > 0 && <span className="sb-cart-count">{cartCount}</span>}
            </button>
          </div>
          <nav className="sb-nav">
            <button className={filter==="All"?"active":""} onClick={() => goFilter("All")}>ALL PRODUCTS</button>
            <button className={filter==="Men"?"active":""} onClick={() => goFilter("Men")}>MEN</button>
            <button className={filter==="Women"?"active":""} onClick={() => goFilter("Women")}>WOMEN</button>
            <button className={filter==="Boys"?"active":""} onClick={() => goFilter("Boys")}>BOYS</button>
            <button className={filter==="Girls"?"active":""} onClick={() => goFilter("Girls")}>GIRLS</button>
            <button onClick={() => document.getElementById("sb-sale")?.scrollIntoView({ behavior: "smooth" })}>SALE</button>
          </nav>
        </div>
      </header>

      <div className={"sb-mobile-backdrop" + (mobileOpen ? " open" : "")} onClick={() => setMobileOpen(false)} />
      <aside className={"sb-mobile-menu" + (mobileOpen ? " open" : "")}>
        <div className="sb-mobile-head"><img src={LOGO} alt="STEPBY" /><button onClick={() => setMobileOpen(false)}>×</button></div>
        <button className="mlink" onClick={() => goFilter("All")}>ALL PRODUCTS</button>
        <button className="mlink" onClick={() => goFilter("Men")}>MEN</button>
        <button className="mlink" onClick={() => goFilter("Women")}>WOMEN</button>
        <button className="mlink" onClick={() => goFilter("Boys")}>BOYS</button>
        <button className="mlink" onClick={() => goFilter("Girls")}>GIRLS</button>
        <button className="mlink" onClick={() => { setMobileOpen(false); document.getElementById("sb-sale")?.scrollIntoView({ behavior: "smooth" }); }}>SALE</button>
        <button className="mlink admin-m" onClick={() => { setMobileOpen(false); setPage("admin"); }}>ADMIN PANEL</button>
      </aside>

      <main>
        <section className="sb-hero" id="top">
          <div className="sb-hero-inner">
            <p className="sb-eyebrow">STEPBY — STEP INTO STYLE</p>
            <h1>YOUR STYLE.<br /><span>YOUR STEP.</span></h1>
            <p className="sb-hero-text">Contemporary fashion designed for everyday confidence. Discover new drops, timeless essentials and statement pieces.</p>
            <div className="sb-hero-actions">
              <button className="sb-btn sb-btn-gold" onClick={() => goFilter("Men")}>SHOP MEN</button>
              <button className="sb-btn sb-btn-outline" onClick={() => goFilter("Women")}>SHOP WOMEN</button>
            </div>
          </div>
        </section>

        <section className="sb-section" id="categories">
          <div className="sb-section-heading">
            <p className="sb-eyebrow gold">EXPLORE STEPBY</p>
            <h2>SHOP BY CATEGORY</h2>
            <p>Find your next look from our latest collections.</p>
          </div>
          <div className="sb-cat-grid">
            {FILTERS.filter((f) => f !== "All").map((f) => (
              <button key={f} className="sb-cat-card" onClick={() => goFilter(f)}>
                <img src={CATEGORY_IMAGES[f]} alt={f} />
                <div><h3>{f.toUpperCase()}</h3><span>SHOP COLLECTION →</span></div>
              </button>
            ))}
          </div>
        </section>

        <section className="sb-section" id="sb-products">
          <div className="sb-section-heading">
            <p className="sb-eyebrow gold">LATEST STYLES</p>
            <h2>NEW ARRIVALS</h2>
            <p>Fresh pieces added to STEPBY.</p>
          </div>
          <div className="sb-tabs">
            {FILTERS.map((f) => (
              <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f.toUpperCase()}</button>
            ))}
          </div>
          <div className="sb-grid">
            {filteredProducts.map((p) => (
              <div className="sb-product" key={p.id}>
                <div className="sb-product-image">
                  {p.badge && <span className={"sb-badge" + (p.badge.toUpperCase()==="SALE" ? " sale" : "")}>{p.badge}</span>}
                  <img
                    src={cldThumb(p.img, 500)}
                    alt={p.name}
                    loading="lazy"
                    className={p.inStock === false ? "sb-img-soldout" : ""}
                    onClick={() => openLightbox(p)}
                  />
                  {p.inStock === false && <span className="sb-soldout-badge">SOLD OUT</span>}
                  <button className="sb-quick-add" disabled={p.inStock === false} onClick={() => addToCart(p)}>
                    {p.inStock === false ? "OUT OF STOCK" : "QUICK ADD"}
                  </button>
                </div>
                <div className="sb-product-info">
                  <p className="sb-product-cat">{p.category}</p>
                  <p className="sb-product-name">{p.name}</p>
                  <p className="sb-price">{money(p.price)}{p.old ? <span className="sb-old">{money(p.old)}</span> : null}</p>
                  {p.inStock === false && <p className="sb-soldout-text">SOLD OUT</p>}
                </div>
              </div>
            ))}
            {filteredProducts.length === 0 && <p className="sb-empty-msg">No products found.</p>}
          </div>
        </section>

        <section className="sb-sale-banner" id="sb-sale">
          <p className="sb-eyebrow gold">STEPBY SALE</p>
          <h2>STYLE MORE.<br /><span style={{ color: "var(--gold2)" }}>SPEND LESS.</span></h2>
          <p>Discover selected styles at special prices while stocks last.</p>
          <button className="sb-btn sb-btn-gold" onClick={() => goFilter("All")}>SHOP SALE</button>
        </section>

        <section className="sb-benefits">
          <div><span className="sb-benefit-icon"><IconTruck /></span><strong>FAST DELIVERY</strong><small>Nationwide delivery across Pakistan</small></div>
          <div><span className="sb-benefit-icon"><IconLock /></span><strong>SECURE PAYMENTS</strong><small>Safe &amp; secure checkout</small></div>
          <div><span className="sb-benefit-icon"><IconReturn /></span><strong>EASY RETURNS</strong><small>Simple return process</small></div>
          <div><span className="sb-benefit-icon"><IconStar /></span><strong>PREMIUM QUALITY</strong><small>Fashion made for everyday life</small></div>
        </section>

        <section className="sb-newsletter">
          <p className="sb-eyebrow gold">JOIN STEPBY</p>
          <h2>Stay In The Loop</h2>
          <p>Get new-drop announcements and exclusive offers.</p>
          <form onSubmit={(e) => { e.preventDefault(); showToast("Subscribed!"); e.target.reset(); }}>
            <input type="email" placeholder="Your email address" required />
            <button type="submit">SUBSCRIBE</button>
          </form>
        </section>
      </main>

      <footer className="sb-footer">
        <div className="sb-footer-grid">
          <div>
            <img className="sb-footer-logo" src={LOGO} alt="STEPBY" />
            <p>STEPBY is a modern fashion destination built around one simple idea: Step Into Style.</p>
          </div>
          <div><h4>SHOP</h4>
            <a href="#sb-products" onClick={(e) => { e.preventDefault(); goFilter("Men"); }}>Men</a>
            <a href="#sb-products" onClick={(e) => { e.preventDefault(); goFilter("Women"); }}>Women</a>
            <a href="#sb-products" onClick={(e) => { e.preventDefault(); goFilter("Boys"); }}>Boys</a>
            <a href="#sb-products" onClick={(e) => { e.preventDefault(); goFilter("Girls"); }}>Girls</a>
            <a href="#sb-sale" onClick={(e) => { e.preventDefault(); document.getElementById("sb-sale")?.scrollIntoView({behavior:"smooth"}); }}>Sale</a>
          </div>
          <div><h4>HELP</h4><a href="#">Contact Us</a><a href="#">Track Order</a><a href="#">Shipping</a><a href="#">Returns &amp; Exchange</a><a href="#">Size Guide</a></div>
          <div><h4>FOLLOW</h4><a href="#">Instagram</a><a href="#">Facebook</a><a href="#">TikTok</a><a href="#">WhatsApp</a></div>
        </div>
        <div className="sb-copyright">
          <span>© 2026 STEPBY. All Rights Reserved.</span>
          <span style={{ display: "flex", gap: 16, alignItems: "center" }}>
            STEP INTO STYLE
            <button className="sb-footer-admin-link" onClick={() => setPage("admin")}>Admin Login</button>
          </span>
        </div>
      </footer>

      {/* Search modal */}
      <div className={"sb-overlay" + (searchOpen ? " open" : "")} style={{ alignItems: "flex-start" }} onClick={(e) => e.target === e.currentTarget && setSearchOpen(false)}>
        <div className="sb-modal-box" style={{ marginTop: 90 }}>
          <button className="sb-close-x" onClick={() => setSearchOpen(false)}>×</button>
          <h3>Search products</h3>
          <div className="sb-form-row" style={{ marginTop: 16 }}>
            <input autoFocus placeholder="Search for a product..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <button className="sb-btn sb-btn-dark" style={{ width: "100%" }} onClick={() => { setSearchOpen(false); document.getElementById("sb-products")?.scrollIntoView({ behavior: "smooth" }); }}>VIEW RESULTS</button>
        </div>
      </div>

      {/* Image lightbox — opened by tapping a product photo */}
      <div className={"sb-overlay" + (lightbox ? " open" : "")} onClick={(e) => e.target === e.currentTarget && setLightbox(null)}>
        {lightbox && (
          <div className="sb-lightbox-box">
            <button className="sb-close-x sb-lightbox-close" onClick={() => setLightbox(null)}>×</button>
            <img src={cldThumb(lightbox.images[lightbox.index], 1200)} alt={lightbox.name} />
            {lightbox.images.length > 1 && (
              <>
                <button className="sb-lightbox-nav prev" onClick={lightboxPrev}>‹</button>
                <button className="sb-lightbox-nav next" onClick={lightboxNext}>›</button>
                <div className="sb-lightbox-count">{lightbox.index + 1} / {lightbox.images.length}</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cart drawer */}
      <div className={"sb-overlay" + (cartOpen ? " open" : "")} onClick={(e) => e.target === e.currentTarget && setCartOpen(false)}>
        <aside className="sb-cart-drawer">
          <div className="sb-cart-head"><h3>YOUR CART</h3><button onClick={() => setCartOpen(false)}>×</button></div>
          <div className="sb-cart-items">
            {cartLines.length === 0 && <div className="sb-cart-empty">Your cart is empty.</div>}
            {cartLines.map((l, i) => (
              <div className="sb-cart-row" key={i}>
                <img src={cldThumb(l.product.img, 120)} alt={l.product.name} loading="lazy" />
                <div>
                  <h4>{l.product.name}</h4>
                  <p>{[l.size, l.color].filter(Boolean).join(" · ") || l.product.category} · {money(l.product.price)}</p>
                  <div className="sb-qty">
                    <button onClick={() => updateQty(i, -1)}>−</button>
                    <span>{l.qty}</span>
                    <button onClick={() => updateQty(i, 1)}>+</button>
                  </div>
                </div>
                <button className="sb-remove" onClick={() => removeFromCart(i)}>REMOVE</button>
              </div>
            ))}
          </div>
          <div className="sb-cart-footer">
            <div className="sb-cart-total"><span>TOTAL</span><strong>{money(cartTotal)}</strong></div>
            <button className="sb-checkout" disabled={cartLines.length === 0} onClick={() => setCheckoutOpen(true)}>PROCEED TO CHECKOUT</button>
          </div>
        </aside>
      </div>

      {/* Checkout modal */}
      <div className={"sb-overlay" + (checkoutOpen ? " open" : "")} onClick={(e) => e.target === e.currentTarget && setCheckoutOpen(false)}>
        <div className="sb-modal-box">
          <button className="sb-close-x" onClick={() => setCheckoutOpen(false)}>×</button>
          <h3>DELIVERY DETAILS</h3>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Order total: <b>{money(cartTotal)}</b></p>
          <form onSubmit={placeOrder}>
            <div className="sb-form-row"><label>Full name</label><input name="name" required placeholder="Your full name" /></div>
            <div className="sb-form-two">
              <div className="sb-form-row"><label>Phone</label><input name="phone" required placeholder="03XXXXXXXXX" /></div>
              <div className="sb-form-row"><label>WhatsApp number</label><input name="whatsapp" required placeholder="03XXXXXXXXX" /></div>
            </div>
            <div className="sb-form-row"><label>City</label><input name="city" required placeholder="Multan" /></div>
            <div className="sb-form-row"><label>Delivery address</label><textarea name="address" required rows="3" placeholder="House, street, area"></textarea></div>
            <button className="sb-btn sb-btn-gold" style={{ width: "100%" }} type="submit">PLACE ORDER</button>
          </form>
        </div>
      </div>

      <div className={"sb-toast" + (toast ? " show" : "")}>{toast}</div>
    </div>
  );
}

/* ---------- Safety net: shows a visible message instead of a silently dead page ---------- */
class SbErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("STEPBY app crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: 24, textAlign: "center", fontFamily: "Arial,Helvetica,sans-serif" }}>
          <h2 style={{ margin: 0 }}>Something broke</h2>
          <p style={{ color: "#888", maxWidth: 480 }}>The app hit an error and stopped responding. Details below — share this with whoever is fixing the app:</p>
          <pre style={{ background: "#f7f3ec", padding: 14, borderRadius: 4, maxWidth: "90%", overflow: "auto", textAlign: "left", fontSize: 12 }}>
            {String(this.state.error && this.state.error.stack ? this.state.error.stack : this.state.error)}
          </pre>
          <button onClick={() => this.setState({ error: null })} style={{ padding: "10px 18px", border: "1px solid #111", background: "#111", color: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <SbErrorBoundary>
      <StepbyApp />
    </SbErrorBoundary>
  );
}
