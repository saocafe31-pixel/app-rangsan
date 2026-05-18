import { APP_LOGO_URL } from '../../utils/constants'

export default function LoadingSpinner() {
  return (
    <div className="min-h-dvh w-full min-w-0 flex items-center justify-center gradient-bg">
      <div className="text-center">
        <div className="loading-float mb-8">
          {APP_LOGO_URL ? (
            <img
              src={APP_LOGO_URL}
              alt="APP RANGSAN"
              className="w-24 h-24 mx-auto rounded-full bg-white p-px shadow-lg object-cover"
            />
          ) : (
            <div className="w-24 h-24 mx-auto rounded-full bg-white flex items-center justify-center text-2xl font-bold text-emerald-600 shadow-lg">
              AR
            </div>
          )}
        </div>
        <div className="flex justify-center gap-2">
          <div className="loading-dot w-3 h-3 bg-white rounded-full"></div>
          <div className="loading-dot w-3 h-3 bg-white rounded-full"></div>
          <div className="loading-dot w-3 h-3 bg-white rounded-full"></div>
        </div>
        <p className="text-white mt-4 text-sm font-medium">กำลังโหลด...</p>
      </div>
    </div>
  )
}
