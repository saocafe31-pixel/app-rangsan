import Icon from '../common/Icon'

export default function ProductCard({ product, onAddToCart, onCardClick, user }) {
  // Product price is already normalized based on userType in normalizeProduct
  // So we can use product.price directly
  // But keep fallback logic for safety
  const userType = user?.userType || user?.customerType || 'regular'
  const price = userType === 'franchise' 
    ? (product.franchisePrice > 0 ? product.franchisePrice : product.price)
    : product.price

  const displayPrice = price || 0
  const stock = product.stock || 0
  const isOutOfStock = stock <= 0

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition cursor-pointer"
      onClick={() => (typeof onCardClick === 'function' ? onCardClick(product) : onAddToCart(product))}
    >
      {product.image && (
        <div className="aspect-square bg-gray-100 relative">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = 'none'
            }}
          />
          {isOutOfStock && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                สินค้าหมด
              </span>
            </div>
          )}
          {product.isBundle && (
            <span className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">
              BUNDLE
            </span>
          )}
        </div>
      )}
      
      <div className="p-4">
        <h3 className="font-bold text-gray-900 mb-2 line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </h3>
        
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-2xl font-bold text-emerald-600">
              ฿{displayPrice.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">
              ต่อ {product.unit || 'ชิ้น'}
            </p>
            {user?.customerType === 'franchise' && (
              <p className="text-xs text-gray-500">ราคาแฟรนไชส์</p>
            )}
          </div>
          {stock > 0 && (
            <span className="text-sm text-gray-500">
              <Icon icon="fa-box" className="mr-1" />
              คงเหลือ: {stock} {product.unit || 'ชิ้น'}
            </span>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onAddToCart(product)
          }}
          disabled={isOutOfStock}
          className={`w-full py-2 rounded-lg font-bold transition ${
            isOutOfStock
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95'
          }`}
        >
          {isOutOfStock ? 'สินค้าหมด' : product.isBundle ? 'จัดชุดสินค้า' : 'เพิ่มลงตะกร้า'}
        </button>
      </div>
    </div>
  )
}
