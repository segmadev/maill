import AdminLayout from '../components/layout/AdminLayout'
import SignatureManager from '../components/admin/SignatureManager'

export default function SignaturesPage() {
  return (
    <AdminLayout title="Email Signatures">
      <div className="max-w-6xl mx-auto">
        <SignatureManager />
      </div>
    </AdminLayout>
  )
}
