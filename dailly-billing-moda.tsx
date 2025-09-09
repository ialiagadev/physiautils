"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import {
  FileText,
  X,
  CheckCircle,
  Users,
  Euro,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Download,
  Zap,
  Package,
  User,
  CreditCard,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/app/contexts/auth-context"
import JSZip from "jszip"

interface DailyBillingModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDate: Date
}

interface ClientAppointmentData {
  client_id: number
  client_name: string
  client_tax_id: string | null
  client_address: string | null
  client_postal_code: string | null
  client_city: string | null
  client_province: string | null
  client_email: string | null
  client_phone: string | null
  appointments: Array<{
    id: string
    start_time: string
    end_time: string
    professional_name: string
    consultation_name: string
    notes: string | null
    service_price?: number
    service_vat_rate?: number
    service_irpf_rate?: number
    service_name?: string
    service_retention_rate?: number
    status: string
    type?: "appointment" | "group_activity"
    activity_name?: string
    invoice_status?: "none" | "draft" | "issued" | "verified"
    invoice_info?: {
      invoice_id: string
      invoice_number: string | null
      created_at: string
      total_amount: number
    }
  }>
  total_amount: number
  has_complete_data: boolean
  missing_fields: string[]
  invoiceable_appointments: number
  invoiced_appointments: number
  draft_appointments: number
  payment_method?: "tarjeta" | "efectivo" | "transferencia" | "paypal" | "bizum" | "otro"
  payment_method_other?: string
}

interface BillingProgress {
  phase: "validating" | "generating_drafts" | "issuing" | "creating_pdfs" | "creating_zip" | "completed" | "error"
  current: number
  total: number
  message: string
  errors: string[]
  currentClient?: string
  zipProgress?: number
}

interface GeneratedInvoice {
  invoiceNumber: string
  clientName: string
  amount: number
  pdfBlob: Blob
  invoiceId: string
}

interface DraftInvoice {
  invoice_id: string
  client_id: number
  client_name: string
  total_amount: number
  created_at: string
}

const STATUS_LABELS = {
  confirmed: "Confirmada",
  pending: "Pendiente",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No se presentó",
  registered: "Registrado",
  attended: "Asistió",
}

const STATUS_COLORS = {
  confirmed: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-blue-100 text-blue-800",
  no_show: "bg-gray-100 text-gray-800",
  registered: "bg-blue-100 text-blue-800",
  attended: "bg-green-100 text-green-800",
}

// Componente de progreso mejorado
function EnhancedProgressBar({ progress }: { progress: BillingProgress }) {
  const getPhaseIcon = () => {
    switch (progress.phase) {
      case "validating":
        return <CheckCircle className="h-5 w-5 text-blue-500 animate-pulse" />
      case "generating_drafts":
        return <FileText className="h-5 w-5 text-yellow-500 animate-bounce" />
      case "issuing":
        return <Zap className="h-5 w-5 text-orange-500 animate-pulse" />
      case "creating_pdfs":
        return <FileText className="h-5 w-5 text-green-500 animate-pulse" />
      case "creating_zip":
        return <Package className="h-5 w-5 text-purple-500 animate-spin" />
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case "error":
        return <AlertTriangle className="h-5 w-5 text-red-500" />
      default:
        return <Clock className="h-5 w-5 text-gray-500" />
    }
  }

  const getPhaseColor = () => {
    switch (progress.phase) {
      case "validating":
        return "bg-blue-500"
      case "generating_drafts":
        return "bg-yellow-500"
      case "issuing":
        return "bg-orange-500"
      case "creating_pdfs":
        return "bg-green-500"
      case "creating_zip":
        return "bg-purple-500"
      case "completed":
        return "bg-green-600"
      case "error":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getPhaseLabel = () => {
    switch (progress.phase) {
      case "validating":
        return "Validando datos"
      case "generating_drafts":
        return "Creando borradores"
      case "issuing":
        return "Emitiendo facturas"
      case "creating_pdfs":
        return "Creando PDFs"
      case "creating_zip":
        return "Empaquetando ZIP"
      case "completed":
        return "¡Completado!"
      case "error":
        return "Error"
      default:
        return "Procesando"
    }
  }

  const progressPercentage =
    progress.phase === "creating_zip" && progress.zipProgress
      ? progress.zipProgress
      : (progress.current / progress.total) * 100

  return (
    <Card className="mb-6 border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          {getPhaseIcon()}
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold text-gray-900">{getPhaseLabel()}</CardTitle>
            <p className="text-sm text-gray-600 mt-1">
              {progress.currentClient ? `Procesando: ${progress.currentClient}` : progress.message}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">{Math.round(progressPercentage)}%</div>
            <div className="text-xs text-gray-500">
              {progress.current} de {progress.total}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="relative">
            <Progress value={progressPercentage} className="h-3 bg-gray-200" />
            <div
              className={`absolute top-0 left-0 h-3 rounded-full transition-all duration-500 ${getPhaseColor()}`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="flex justify-between text-xs">
            {["validating", "generating_drafts", "issuing", "creating_pdfs", "creating_zip", "completed"].map(
              (phase, index) => {
                const isActive = progress.phase === phase
                const isCompleted =
                  ["validating", "generating_drafts", "issuing", "creating_pdfs", "creating_zip", "completed"].indexOf(
                    progress.phase,
                  ) > index
                return (
                  <div
                    key={phase}
                    className={`flex flex-col items-center gap-1 ${
                      isActive ? "text-blue-600 font-medium" : isCompleted ? "text-green-600" : "text-gray-400"
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isActive ? "bg-blue-500 animate-pulse" : isCompleted ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    <span className="capitalize">
                      {phase === "generating_drafts"
                        ? "Borradores"
                        : phase === "creating_pdfs"
                          ? "PDFs"
                          : phase === "creating_zip"
                            ? "ZIP"
                            : phase.replace("_", " ")}
                    </span>
                  </div>
                )
              },
            )}
          </div>
          <div className="bg-white/70 rounded-lg p-3 border border-blue-100">
            <p className="text-sm text-gray-700 font-medium">{progress.message}</p>
            {progress.phase === "creating_zip" && (
              <div className="mt-2 flex items-center gap-2 text-xs text-purple-600">
                <Package className="h-3 w-3 animate-spin" />
                <span>Comprimiendo archivos PDF...</span>
              </div>
            )}
          </div>
          {progress.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <h4 className="text-sm font-medium text-red-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Errores encontrados ({progress.errors.length})
              </h4>
              <div className="max-h-24 overflow-y-auto">
                <ul className="text-sm text-red-700 space-y-1">
                  {progress.errors.map((error, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-red-400 mt-0.5">•</span>
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function DailyBillingModal({ isOpen, onClose, selectedDate }: DailyBillingModalProps) {
  const { userProfile } = useAuth()
  const { toast } = useToast()
  const [clientsData, setClientsData] = useState<ClientAppointmentData[]>([])
  const [filteredClientsData, setFilteredClientsData] = useState<ClientAppointmentData[]>([])
  const [selectedClients, setSelectedClients] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [progress, setProgress] = useState<BillingProgress | null>(null)
  const [generatedInvoices, setGeneratedInvoices] = useState<GeneratedInvoice[]>([])
  const [draftInvoices, setDraftInvoices] = useState<DraftInvoice[]>([])
  const [clientPaymentMethods, setClientPaymentMethods] = useState<
    Map<
      number,
      {
        method: "tarjeta" | "efectivo" | "transferencia" | "paypal" | "bizum" | "otro"
        other?: string
      }
    >
  >(new Map())

  // Filtros
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dataFilter, setDataFilter] = useState<string>("all")

  useEffect(() => {
    if (isOpen && userProfile?.organization_id) {
      loadDayAppointments()
    }
  }, [isOpen, selectedDate, userProfile])

  // Aplicar filtros
  useEffect(() => {
    let filtered = [...clientsData]

    if (searchTerm) {
      filtered = filtered.filter(
        (client) =>
          client.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          client.client_tax_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          client.appointments.some(
            (apt) =>
              apt.professional_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              apt.consultation_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              apt.activity_name?.toLowerCase().includes(searchTerm.toLowerCase()),
          ),
      )
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((client) => client.appointments.some((apt) => apt.status === statusFilter))
    }

    if (dataFilter === "complete") {
      filtered = filtered.filter((client) => client.has_complete_data)
    } else if (dataFilter === "incomplete") {
      filtered = filtered.filter((client) => !client.has_complete_data)
    }

    setFilteredClientsData(filtered)
  }, [clientsData, searchTerm, statusFilter, dataFilter])

  const handlePaymentMethodChange = (clientId: number, method: string, other?: string) => {
    setClientPaymentMethods((prev) => {
      const newMap = new Map(prev)
      newMap.set(clientId, {
        method: method as "tarjeta" | "efectivo" | "transferencia" | "paypal" | "bizum" | "otro",
        other: method === "otro" ? other : undefined,
      })
      return newMap
    })
  }

  const loadDayAppointments = async () => {
    setLoading(true)
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd")

      // Cargar citas individuales
      const { data: appointments, error } = await supabase
        .from("appointments")
        .select(`
          id,
          start_time,
          end_time,
          notes,
          status,
          client_id,
          clients (
            id,
            name,
            tax_id,
            address,
            postal_code,
            city,
            province,
            email,
            phone
          ),
          professional:users!appointments_professional_id_fkey (
            name
          ),
          consultation:consultations (
            name
          ),
          services (
            name,
            price,
            vat_rate,
            irpf_rate,
            retention_rate
          )
        `)
        .eq("organization_id", userProfile!.organization_id)
        .eq("date", dateStr)
        .order("client_id")

      if (error) {
        throw error
      }

      // ✅ CARGAR ACTIVIDADES GRUPALES SIN LA RELACIÓN PROBLEMÁTICA
      const { data: groupActivities, error: groupError } = await supabase
        .from("group_activities")
        .select(`
          id,
          name,
          start_time,
          end_time,
          professional_id,
          service_id,
          group_activity_participants (
            status,
            client_id,
            clients (
              id,
              name,
              tax_id,
              address,
              postal_code,
              city,
              province,
              email,
              phone
            )
          )
        `)
        .eq("organization_id", userProfile!.organization_id)
        .eq("date", dateStr)

      if (groupError) {
        throw groupError
      }

      // Cargar datos auxiliares para resolver en JS
      const [usersData, servicesData] = await Promise.all([
        supabase.from("users").select("id, name").eq("organization_id", userProfile!.organization_id),
        supabase
          .from("services")
          .select("id, name, price, vat_rate, irpf_rate, retention_rate")
          .eq("organization_id", userProfile!.organization_id),
      ])

      const users = usersData.data || []
      const services = servicesData.data || []

      // Combinar datos
      const allAppointments = appointments || []
      const clientsMap = new Map<number, ClientAppointmentData>()

      // Procesar citas individuales
      allAppointments.forEach((apt: any) => {
        const client = apt.clients
        const clientId = client.id

        if (!clientsMap.has(clientId)) {
          // ✅ VALIDACIÓN MODIFICADA - SOLO NOMBRE (CON APELLIDOS) Y TAX_ID
          const missingFields: string[] = []

          // Verificar nombre (debe tener al menos 2 palabras para incluir apellidos)
          if (!client.name?.trim()) {
            missingFields.push("Nombre")
          } else {
            const nameParts = client.name.trim().split(/\s+/)
            if (nameParts.length < 2) {
              missingFields.push("Apellidos (el nombre debe incluir nombre y apellidos)")
            }
          }

          // Verificar tax_id (CIF/NIF)
          if (!client.tax_id?.trim()) {
            missingFields.push("CIF/NIF")
          }

          clientsMap.set(clientId, {
            client_id: clientId,
            client_name: client.name || "Sin nombre",
            client_tax_id: client.tax_id,
            client_address: client.address,
            client_postal_code: client.postal_code,
            client_city: client.city,
            client_province: client.province,
            client_email: client.email,
            client_phone: client.phone,
            appointments: [],
            total_amount: 0,
            has_complete_data: missingFields.length === 0,
            missing_fields: missingFields,
            invoiceable_appointments: 0,
            invoiced_appointments: 0,
            draft_appointments: 0,
          })
        }

        const clientData = clientsMap.get(clientId)!
        const servicePrice = apt.services?.price || 50

        clientData.appointments.push({
          id: apt.id,
          start_time: apt.start_time,
          end_time: apt.end_time,
          professional_name: apt.professional?.name || "Sin asignar",
          consultation_name: apt.consultation?.name || "Consulta general",
          notes: apt.notes,
          service_price: servicePrice,
          service_name: apt.services?.name,
          service_vat_rate: apt.services?.vat_rate ?? 0,
          service_irpf_rate: apt.services?.irpf_rate ?? 0,
          service_retention_rate: apt.services?.retention_rate ?? 0,
          status: apt.status,
          type: "appointment",
          invoice_status: "none", // Se actualizará después
        })
      })

      // ✅ PROCESAR ACTIVIDADES GRUPALES RESOLVIENDO LAS RELACIONES EN JS
      groupActivities?.forEach((activity: any) => {
        const professional = users.find((user) => user.id === activity.professional_id)
        const service = services.find((svc) => svc.id === activity.service_id)
        const validParticipants =
          activity.group_activity_participants?.filter(
            (p: any) => p.status === "attended" || p.status === "registered",
          ) || []

        validParticipants.forEach((participant: any) => {
          const client = participant.clients
          const clientId = client.id

          if (!clientsMap.has(clientId)) {
            // ✅ VALIDACIÓN MODIFICADA - SOLO NOMBRE (CON APELLIDOS) Y TAX_ID
            const missingFields: string[] = []

            // Verificar nombre (debe tener al menos 2 palabras para incluir apellidos)
            if (!client.name?.trim()) {
              missingFields.push("Nombre")
            } else {
              const nameParts = client.name.trim().split(/\s+/)
              if (nameParts.length < 2) {
                missingFields.push("Apellidos (el nombre debe incluir nombre y apellidos)")
              }
            }

            // Verificar tax_id (CIF/NIF)
            if (!client.tax_id?.trim()) {
              missingFields.push("CIF/NIF")
            }

            clientsMap.set(clientId, {
              client_id: clientId,
              client_name: client.name || "Sin nombre",
              client_tax_id: client.tax_id,
              client_address: client.address,
              client_postal_code: client.postal_code,
              client_city: client.city,
              client_province: client.province,
              client_email: client.email,
              client_phone: client.phone,
              appointments: [],
              total_amount: 0,
              has_complete_data: missingFields.length === 0,
              missing_fields: missingFields,
              invoiceable_appointments: 0,
              invoiced_appointments: 0,
              draft_appointments: 0,
            })
          }

          const clientData = clientsMap.get(clientId)!
          const servicePrice = service?.price || 50

          clientData.appointments.push({
            id: `group_${activity.id}_${participant.client_id}`,
            start_time: activity.start_time,
            end_time: activity.end_time,
            professional_name: professional?.name || "Sin asignar",
            consultation_name: activity.name,
            notes: null,
            service_price: servicePrice,
            service_vat_rate: service?.vat_rate ?? 0,
            service_irpf_rate: service?.irpf_rate ?? 0,
            service_retention_rate: service?.retention_rate ?? 0,
            status: participant.status,
            type: "group_activity",
            activity_name: activity.name,
            invoice_status: "none", // Se actualizará después
          })
        })
      })

      const clientsArray = Array.from(clientsMap.values())

      // ✅ VERIFICAR FACTURAS EXISTENTES DIRECTAMENTE EN LA BASE DE DATOS
      await checkInvoiceStatusFromDatabase(clientsArray)

      setClientsData(clientsArray)
    } catch (error) {
      console.error("Error loading appointments:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar las citas del día",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // ✅ NUEVA FUNCIÓN: VERIFICAR ESTADO DE FACTURAS DIRECTAMENTE EN LA BASE DE DATOS
  const checkInvoiceStatusFromDatabase = async (clientsArray: ClientAppointmentData[]) => {
    if (!userProfile?.organization_id) return

    try {
      const drafts: DraftInvoice[] = []

      // Para cada cliente y cada cita, verificar si existe factura
      for (const client of clientsArray) {
        for (const appointment of client.appointments) {
          let invoiceQuery = supabase
            .from("invoices")
            .select("id, invoice_number, status, total_amount, created_at, verifactu_sent_at")
            .eq("organization_id", userProfile.organization_id)

          if (appointment.type === "appointment") {
            invoiceQuery = invoiceQuery.eq("appointment_id", appointment.id)
          } else if (appointment.type === "group_activity") {
            const activityId = appointment.id.split("_")[1]
            invoiceQuery = invoiceQuery.eq("group_activity_id", activityId).eq("client_id", client.client_id)
          }

          const { data: invoiceData, error } = await invoiceQuery.limit(1)

          if (error) {
            console.error("Error checking invoice:", error)
            continue
          }

          if (invoiceData && invoiceData.length > 0) {
            const invoice = invoiceData[0]

            // Determinar el estado de la factura
            let invoiceStatus: "none" | "draft" | "issued" | "verified" = "none"

            if (invoice.status === "draft") {
              invoiceStatus = "draft"
            } else if (invoice.status === "issued") {
              if (invoice.verifactu_sent_at) {
                invoiceStatus = "verified"
              } else {
                invoiceStatus = "issued"
              }
            }

            // Actualizar el appointment con la información de la factura
            appointment.invoice_status = invoiceStatus
            appointment.invoice_info = {
              invoice_id: invoice.id,
              invoice_number: invoice.invoice_number,
              created_at: invoice.created_at,
              total_amount: invoice.total_amount,
            }

            // Si es borrador, añadir a la lista de borradores
            if (invoiceStatus === "draft") {
              const existingDraft = drafts.find((d) => d.invoice_id === invoice.id)
              if (!existingDraft) {
                drafts.push({
                  invoice_id: invoice.id,
                  client_id: client.client_id,
                  client_name: client.client_name,
                  total_amount: invoice.total_amount,
                  created_at: invoice.created_at,
                })
              }
            }
          } else {
            appointment.invoice_status = "none"
          }
        }

        // ✅ CALCULAR TOTALES CORRECTAMENTE BASADO EN EL ESTADO REAL
        const invoiceableAppointments = client.appointments.filter((apt) => apt.invoice_status === "none")
        const draftAppointments = client.appointments.filter((apt) => apt.invoice_status === "draft")
        const invoicedAppointments = client.appointments.filter(
          (apt) => apt.invoice_status === "issued" || apt.invoice_status === "verified",
        )

        client.invoiceable_appointments = invoiceableAppointments.length
        client.draft_appointments = draftAppointments.length
        client.invoiced_appointments = invoicedAppointments.length

        // El total_amount solo incluye citas sin facturar (invoice_status === "none")
        client.total_amount = invoiceableAppointments.reduce((sum, apt) => sum + (apt.service_price || 50), 0)
      }

      // Actualizar lista de borradores
      setDraftInvoices(drafts)

      // ✅ SELECCIONAR AUTOMÁTICAMENTE SOLO CLIENTES VÁLIDOS (SIN BORRADORES NI FACTURAS)
      const clientsToSelect = clientsArray
        .filter((client) => client.has_complete_data && client.invoiceable_appointments > 0)
        .map((client) => client.client_id)

      setSelectedClients(new Set(clientsToSelect))
    } catch (error) {
      console.error("Error checking invoice status from database:", error)
    }
  }

  const handleClientToggle = (clientId: number, checked: boolean) => {
    const clientData = clientsData.find((c) => c.client_id === clientId)

    // ✅ VERIFICACIÓN SIMPLE: ¿Tiene citas facturables?
    if (clientData && clientData.invoiceable_appointments === 0) {
      return // No permitir si no hay citas facturables
    }

    const newSelected = new Set(selectedClients)
    if (checked) {
      newSelected.add(clientId)
    } else {
      newSelected.delete(clientId)
    }
    setSelectedClients(newSelected)
  }

  const handleSelectAll = () => {
    const validClientIds = filteredClientsData
      .filter((client) => client.has_complete_data && client.invoiceable_appointments > 0)
      .map((client) => client.client_id)
    setSelectedClients(new Set(validClientIds))
  }

  const handleDeselectAll = () => {
    setSelectedClients(new Set())
  }

  // ✅ CREAR BORRADORES DE FACTURAS
  const generateDraftInvoices = async () => {
    if (selectedClients.size === 0) return

    setGenerating(true)
    setGeneratedInvoices([])
    const selectedClientsArray = Array.from(selectedClients)

    setProgress({
      phase: "validating",
      current: 0,
      total: selectedClientsArray.length,
      message: "🔍 Validando datos de clientes y preparando el proceso...",
      errors: [],
    })

    try {
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", userProfile!.organization_id)
        .single()

      if (orgError || !orgData) {
        throw new Error("No se pudieron obtener los datos de la organización")
      }

      setProgress((prev) => ({
        ...prev!,
        phase: "generating_drafts",
        message: "📄 Creando borradores de facturas...",
      }))

      const errors: string[] = []
      let successCount = 0

      for (let i = 0; i < selectedClientsArray.length; i++) {
        const clientId = selectedClientsArray[i]
        const clientData = clientsData.find((c) => c.client_id === clientId)!

        setProgress((prev) => ({
          ...prev!,
          current: i + 1,
          message: `📄 Creando borrador ${i + 1} de ${selectedClientsArray.length}`,
          currentClient: clientData.client_name,
        }))

        try {
          // Obtener método de pago específico del cliente
          const clientPaymentInfo = clientPaymentMethods.get(clientId) || { method: "tarjeta" }
          const paymentMethod = clientPaymentInfo.method
          const paymentMethodOther = clientPaymentInfo.other

          // Validar método de pago específico del cliente
          if (paymentMethod === "otro" && !paymentMethodOther?.trim()) {
            errors.push(`${clientData.client_name}: Método de pago 'Otro' sin especificar`)
            continue
          }

          // ✅ FILTRAR SOLO LAS CITAS SIN FACTURAR (invoice_status === "none")
          const invoiceLines = clientData.appointments
            .filter((apt) => apt.invoice_status === "none")
            .map((apt) => ({
              id: crypto.randomUUID(),
              description:
                apt.type === "group_activity"
                  ? `Actividad Grupal: ${apt.activity_name} - ${apt.professional_name} (${apt.start_time}-${apt.end_time})`
                  : `${apt.service_name || "Servicio médico"} - ${apt.professional_name} (${apt.start_time}-${apt.end_time})`,
              quantity: 1,
              unit_price: apt.service_price || 50,
              discount_percentage: 0,
              vat_rate: apt.service_vat_rate ?? 0,
              irpf_rate: apt.service_irpf_rate ?? 0,
              retention_rate: apt.service_retention_rate ?? 0,
              line_amount: apt.service_price || 50,
              professional_id: null,
            }))

          if (invoiceLines.length === 0) {
            errors.push(`${clientData.client_name}: No hay citas sin facturar`)
            continue
          }

          const subtotalAmount = invoiceLines.reduce((sum, line) => {
            return sum + line.quantity * line.unit_price
          }, 0)

          const totalDiscountAmount = invoiceLines.reduce((sum, line) => {
            const lineSubtotal = line.quantity * line.unit_price
            const lineDiscount = (lineSubtotal * line.discount_percentage) / 100
            return sum + lineDiscount
          }, 0)

          const baseAmount = subtotalAmount - totalDiscountAmount

          const vatAmount = invoiceLines.reduce((sum, line) => {
            const lineSubtotal = line.quantity * line.unit_price
            const lineDiscount = (lineSubtotal * line.discount_percentage) / 100
            const lineBase = lineSubtotal - lineDiscount
            const lineVat = (lineBase * line.vat_rate) / 100
            return sum + lineVat
          }, 0)

          const irpfAmount = invoiceLines.reduce((sum, line) => {
            const lineSubtotal = line.quantity * line.unit_price
            const lineDiscount = (lineSubtotal * line.discount_percentage) / 100
            const lineBase = lineSubtotal - lineDiscount
            const lineIrpf = (lineBase * line.irpf_rate) / 100
            return sum + lineIrpf
          }, 0)

          const retentionAmount = invoiceLines.reduce((sum, line) => {
            const lineSubtotal = line.quantity * line.unit_price
            const lineDiscount = (lineSubtotal * line.discount_percentage) / 100
            const lineBase = lineSubtotal - lineDiscount
            const lineRetention = (lineBase * line.retention_rate) / 100
            return sum + lineRetention
          }, 0)

          const totalAmount = baseAmount + vatAmount - irpfAmount - retentionAmount

          // ✅ PREPARAR NOTAS DE LA FACTURA - INFORMACIÓN SIMPLIFICADA
          const clientInfoText = `Cliente: ${clientData.client_name}, CIF/NIF: ${clientData.client_tax_id}`
          const additionalNotes = `Factura generada automáticamente para citas del ${format(selectedDate, "dd/MM/yyyy", { locale: es })}`

          // Añadir nota de IVA exento automáticamente si vatAmount === 0
          const notaIVAExenta =
            vatAmount === 0 && baseAmount > 0
              ? "\n\nOperación exenta de IVA conforme al artículo 20. Uno. 3º de la Ley 37/1992 del Impuesto sobre el Valor Añadido, por tratarse de un servicio de asistencia sanitaria prestado por profesional titulado"
              : ""

          const fullNotes = clientInfoText + "\n\n" + additionalNotes + notaIVAExenta

          // ✅ CREAR FACTURA EN ESTADO BORRADOR (SIN NÚMERO)
          const { data: invoiceData, error: invoiceError } = await supabase
            .from("invoices")
            .insert({
              organization_id: userProfile!.organization_id,
              invoice_number: null, // ✅ Sin número en borrador
              client_id: clientId,
              appointment_id:
                clientData.appointments.find((apt) => apt.type === "appointment" && apt.invoice_status === "none")
                  ?.id || null,
              group_activity_id:
                clientData.appointments
                  .find((apt) => apt.type === "group_activity" && apt.invoice_status === "none")
                  ?.id?.split("_")[1] || null,
              issue_date: format(new Date(), "yyyy-MM-dd"), // ✅ FECHA ACTUAL, no la fecha de la cita
              invoice_type: "normal",
              status: "draft", // ✅ Estado borrador
              base_amount: baseAmount,
              vat_amount: vatAmount,
              irpf_amount: irpfAmount,
              retention_amount: retentionAmount,
              total_amount: totalAmount,
              discount_amount: totalDiscountAmount,
              notes: fullNotes,
              payment_method: paymentMethod,
              payment_method_other: paymentMethod === "otro" ? paymentMethodOther : null,
              created_by: userProfile!.id,
            })
            .select()
            .single()

          if (invoiceError) throw invoiceError

          const invoiceLines_db = invoiceLines.map((line) => ({
            invoice_id: invoiceData.id,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unit_price,
            discount_percentage: line.discount_percentage,
            vat_rate: line.vat_rate,
            irpf_rate: line.irpf_rate,
            retention_rate: line.retention_rate,
            line_amount: line.line_amount,
            professional_id: line.professional_id ? Number.parseInt(line.professional_id) : null,
          }))

          const { error: linesError } = await supabase.from("invoice_lines").insert(invoiceLines_db)

          if (linesError) {
            console.error("Error saving invoice lines:", linesError)
          }

          // ✅ ACTUALIZAR ESTADO LOCAL INMEDIATAMENTE
          setDraftInvoices((prev) => [
            ...prev,
            {
              invoice_id: invoiceData.id,
              client_id: clientId,
              client_name: clientData.client_name,
              total_amount: totalAmount,
              created_at: invoiceData.created_at,
            },
          ])

          // ✅ ACTUALIZAR ESTADO DE LAS CITAS
          setClientsData((prevClients) =>
            prevClients.map((client) => {
              if (client.client_id === clientId) {
                return {
                  ...client,
                  appointments: client.appointments.map((apt) => {
                    if (apt.invoice_status === "none") {
                      return {
                        ...apt,
                        invoice_status: "draft" as const,
                        invoice_info: {
                          invoice_id: invoiceData.id,
                          invoice_number: null,
                          created_at: invoiceData.created_at,
                          total_amount: totalAmount,
                        },
                      }
                    }
                    return apt
                  }),
                  invoiceable_appointments: 0,
                  draft_appointments: client.appointments.filter((apt) => apt.invoice_status === "none").length,
                  total_amount: 0,
                }
              }
              return client
            }),
          )

          // Remover de seleccionados
          setSelectedClients((prev) => {
            const newSet = new Set(prev)
            newSet.delete(clientId)
            return newSet
          })

          successCount++
        } catch (error) {
          console.error(`Error generating draft for client ${clientData.client_name}:`, error)
          errors.push(`${clientData.client_name}: ${error instanceof Error ? error.message : "Error desconocido"}`)
        }

        await new Promise((resolve) => setTimeout(resolve, 300))
      }

      setProgress({
        phase: "completed",
        current: selectedClientsArray.length,
        total: selectedClientsArray.length,
        message: `🎉 ¡Borradores creados exitosamente! ${successCount} borradores generados.`,
        errors,
      })

      if (successCount > 0) {
        toast({
          title: "✅ Borradores creados",
          description: `Se crearon ${successCount} borradores correctamente`,
        })
      }

      if (errors.length > 0) {
        toast({
          title: "⚠️ Algunos errores encontrados",
          description: `${errors.length} borradores no se pudieron crear`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error in draft creation process:", error)
      setProgress({
        phase: "error",
        current: 0,
        total: selectedClientsArray.length,
        message: "❌ Error en el proceso de creación de borradores",
        errors: [error instanceof Error ? error.message : "Error desconocido"],
      })
    } finally {
      setGenerating(false)
    }
  }

  // ✅ EMITIR FACTURAS (ASIGNAR NÚMEROS Y ENVIAR A VERIFACTU)
  const issueAllDrafts = async () => {
    if (draftInvoices.length === 0) return

    setIssuing(true)
    setGeneratedInvoices([])

    setProgress({
      phase: "validating",
      current: 0,
      total: draftInvoices.length,
      message: "🔍 Preparando emisión de facturas...",
      errors: [],
    })

    try {
      const { generateUniqueInvoiceNumber } = await import("@/lib/invoice-utils")
      const { generatePdf } = await import("@/lib/pdf-generator")

      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", userProfile!.organization_id)
        .single()

      if (orgError || !orgData) {
        throw new Error("No se pudieron obtener los datos de la organización")
      }

      setProgress((prev) => ({
        ...prev!,
        phase: "issuing",
        message: "⚡ Emitiendo facturas y enviando a VeriFactu...",
      }))

      const errors: string[] = []
      let successCount = 0
      const invoicesForZip: GeneratedInvoice[] = []

      for (let i = 0; i < draftInvoices.length; i++) {
        const draft = draftInvoices[i]

        setProgress((prev) => ({
          ...prev!,
          current: i + 1,
          message: `⚡ Emitiendo factura ${i + 1} de ${draftInvoices.length}`,
          currentClient: draft.client_name,
        }))

        try {
          // Generar número de factura único
          const { invoiceNumberFormatted, newInvoiceNumber } = await generateUniqueInvoiceNumber(
            userProfile!.organization_id,
            "normal",
          )

          // Actualizar contador en organización
          const { error: updateOrgError } = await supabase
            .from("organizations")
            .update({ last_invoice_number: newInvoiceNumber })
            .eq("id", userProfile!.organization_id)

          if (updateOrgError) {
            throw new Error("Error al reservar el número de factura")
          }

          // Actualizar factura con número y estado
          const { error: updateInvoiceError } = await supabase
            .from("invoices")
            .update({
              status: "issued",
              invoice_number: invoiceNumberFormatted,
              validated_at: new Date().toISOString(),
            })
            .eq("id", draft.invoice_id)

          if (updateInvoiceError) {
            throw new Error("Error al actualizar la factura")
          }

          // Enviar a VeriFactu
          /*
          try {
            const res = await fetch(`/api/verifactu/send-invoice?invoice_id=${draft.invoice_id}`)
            const data = await res.json()

            if (!res.ok) {
              throw new Error(data?.error || `Error ${res.status}: ${res.statusText}`)
            }
          } catch (verifactuError) {
            console.error("Error en VeriFactu, haciendo rollback...")

            // Rollback completo
            await supabase
              .from("invoices")
              .update({
                status: "draft",
                invoice_number: null,
                validated_at: null,
              })
              .eq("id", draft.invoice_id)

            await supabase
              .from("organizations")
              .update({ last_invoice_number: newInvoiceNumber - 1 })
              .eq("id", userProfile!.organization_id)

            throw new Error("Error al enviar a VeriFactu. Se ha revertido la emisión.")
          }
          */

          // Fase de creación de PDFs
          setProgress((prev) => ({
            ...prev!,
            phase: "creating_pdfs",
            message: `📄 Generando PDF para ${draft.client_name}...`,
            currentClient: draft.client_name,
          }))

          // Obtener datos completos de la factura para el PDF
          const { data: fullInvoiceData, error: invoiceError } = await supabase
            .from("invoices")
            .select(`
                *,
                organization:organizations(*),
                client:clients(*),
                invoice_lines(*)
              `)
            .eq("id", draft.invoice_id)
            .single()

          if (invoiceError || !fullInvoiceData) {
            throw new Error("No se pudieron obtener los datos de la factura")
          }

          // Preparar datos para el PDF
          const invoiceForPdf = {
            ...fullInvoiceData,
            client_data: {
              name: fullInvoiceData.client.name,
              tax_id: fullInvoiceData.client.tax_id || "",
              address: fullInvoiceData.client.address || "",
              postal_code: fullInvoiceData.client.postal_code || "",
              city: fullInvoiceData.client.city || "",
              province: fullInvoiceData.client.province || "",
              country: "España",
              email: fullInvoiceData.client.email || "",
              phone: fullInvoiceData.client.phone || "",
              client_type: "private",
            },
          }

          const pdfBlob = await generatePdf(
            invoiceForPdf,
            fullInvoiceData.invoice_lines,
            `factura-${invoiceNumberFormatted}.pdf`,
            false,
          )

          if (pdfBlob && pdfBlob instanceof Blob) {
            invoicesForZip.push({
              invoiceNumber: invoiceNumberFormatted,
              clientName: draft.client_name,
              amount: fullInvoiceData.total_amount,
              pdfBlob: pdfBlob,
              invoiceId: draft.invoice_id,
            })
          }

          successCount++
        } catch (error) {
          console.error(`Error issuing invoice for client ${draft.client_name}:`, error)
          errors.push(`${draft.client_name}: ${error instanceof Error ? error.message : "Error desconocido"}`)
        }

        await new Promise((resolve) => setTimeout(resolve, 300))
      }

      // Crear ZIP con todas las facturas
      if (invoicesForZip.length > 0) {
        setProgress((prev) => ({
          ...prev!,
          phase: "creating_zip",
          message: "📦 Empaquetando facturas en archivo ZIP...",
          zipProgress: 0,
        }))

        const zip = new JSZip()

        for (let i = 0; i < invoicesForZip.length; i++) {
          const invoice = invoicesForZip[i]
          setProgress((prev) => ({
            ...prev!,
            zipProgress: ((i + 1) / invoicesForZip.length) * 100,
            message: `📦 Añadiendo ${invoice.invoiceNumber} al ZIP... (${i + 1}/${invoicesForZip.length})`,
          }))

          const cleanClientName = invoice.clientName
            .replace(/[^a-zA-Z0-9\s]/g, "")
            .replace(/\s+/g, "_")
            .substring(0, 30)
          const fileName = `${invoice.invoiceNumber}_${cleanClientName}.pdf`
          zip.file(fileName, invoice.pdfBlob)

          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        setProgress((prev) => ({
          ...prev!,
          message: "🗜️ Comprimiendo archivo ZIP...",
          zipProgress: 95,
        }))

        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        })

        setProgress((prev) => ({
          ...prev!,
          message: "💾 ZIP listo para descarga...",
          zipProgress: 100,
        }))

        setGeneratedInvoices(invoicesForZip)
      }

      // Limpiar lista de borradores y recargar datos
      setDraftInvoices([])
      await checkInvoiceStatusFromDatabase(clientsData)

      // Completado
      setProgress({
        phase: "completed",
        current: draftInvoices.length,
        total: draftInvoices.length,
        message: `🎉 ¡Facturas emitidas exitosamente! ${successCount} facturas emitidas. VeriFactu temporalmente desactivado. Usa el botón "Descargar ZIP" para obtener el archivo.`,
        errors,
      })

      if (successCount > 0) {
        toast({
          title: "🎉 Facturas emitidas",
          description: `Se emitieron ${successCount} facturas correctamente. VeriFactu temporalmente desactivado. Usa el botón para descargar el ZIP`,
        })
      }

      if (errors.length > 0) {
        toast({
          title: "⚠️ Algunos errores encontrados",
          description: `${errors.length} facturas no se pudieron emitir`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error in invoice issuing process:", error)
      setProgress({
        phase: "error",
        current: 0,
        total: draftInvoices.length,
        message: "❌ Error en el proceso de emisión de facturas",
        errors: [error instanceof Error ? error.message : "Error desconocido"],
      })
    } finally {
      setIssuing(false)
    }
  }

  const downloadZipAgain = async () => {
    if (generatedInvoices.length === 0) return

    try {
      const zip = new JSZip()
      generatedInvoices.forEach((invoice) => {
        const cleanClientName = invoice.clientName
          .replace(/[^a-zA-Z0-9\s]/g, "")
          .replace(/\s+/g, "")
          .replace(/\s+/g, "_")
          .substring(0, 30)
        const fileName = `${invoice.invoiceNumber}_${cleanClientName}.pdf`
        zip.file(fileName, invoice.pdfBlob)
      })

      const zipBlob = await zip.generateAsync({ type: "blob" })
      const dateStr = format(selectedDate, "yyyy-MM-dd")
      const zipFileName = `facturas_${dateStr}_${generatedInvoices.length}_facturas.zip`

      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = zipFileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "📦 ZIP descargado",
        description: `Se descargó nuevamente el archivo con ${generatedInvoices.length} facturas`,
      })
    } catch (error) {
      console.error("Error downloading ZIP:", error)
      toast({
        title: "❌ Error",
        description: "No se pudo descargar el archivo ZIP",
        variant: "destructive",
      })
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(amount)
  }

  const getTotalSelected = () => {
    return filteredClientsData
      .filter((client) => selectedClients.has(client.client_id))
      .reduce((sum, client) => sum + client.total_amount, 0)
  }

  const getStatusCounts = () => {
    const counts: Record<string, number> = {}
    clientsData.forEach((client) => {
      client.appointments.forEach((apt) => {
        counts[apt.status] = (counts[apt.status] || 0) + 1
      })
    })
    return counts
  }

  if (!isOpen) return null

  const statusCounts = getStatusCounts()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Facturación del Día</h2>
                <p className="text-sm text-gray-600">
                  {format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })} - Citas individuales +
                  Actividades grupales
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                // Solo permitir cerrar si no está generando ni emitiendo
                if (!generating && !issuing) {
                  onClose()
                }
              }}
              disabled={generating || issuing}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2 animate-spin" />
                <p className="text-gray-600">Cargando todas las citas del día...</p>
              </div>
            </div>
          ) : clientsData.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay citas ni actividades grupales</h3>
              <p className="text-gray-600">No se encontraron citas ni actividades grupales para este día.</p>
            </div>
          ) : (
            <>
              {progress && <EnhancedProgressBar progress={progress} />}

              {/* Mostrar borradores creados */}
              {draftInvoices.length > 0 && (
                <Card className="mb-6 border-2 border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-amber-600" />
                      Borradores Creados ({draftInvoices.length})
                    </CardTitle>
                    <p className="text-sm text-gray-600">
                      Se han creado {draftInvoices.length} borradores. Puedes emitirlos para asignar números de factura
                      y enviar a VeriFactu.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-4">
                      {draftInvoices.map((draft) => (
                        <div
                          key={draft.invoice_id}
                          className="flex items-center justify-between p-2 bg-white rounded border"
                        >
                          <div className="flex-1">
                            <span className="font-medium">{draft.client_name}</span>
                            <span className="text-sm text-gray-500 ml-2">{formatCurrency(draft.total_amount)}</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const { generatePdf } = await import("@/lib/pdf-generator")

                                // Obtener datos completos de la factura
                                const { data: fullInvoiceData, error: invoiceError } = await supabase
                                  .from("invoices")
                                  .select(`
                                    *,
                                    organization:organizations(*),
                                    client:clients(*),
                                    invoice_lines(*)
                                  `)
                                  .eq("id", draft.invoice_id)
                                  .single()

                                if (invoiceError || !fullInvoiceData) {
                                  throw new Error("No se pudieron obtener los datos de la factura")
                                }

                                const invoiceForPdf = {
                                  ...fullInvoiceData,
                                  client_data: {
                                    name: fullInvoiceData.client.name,
                                    tax_id: fullInvoiceData.client.tax_id || "",
                                    address: fullInvoiceData.client.address || "",
                                    postal_code: fullInvoiceData.client.postal_code || "",
                                    city: fullInvoiceData.client.city || "",
                                    province: fullInvoiceData.client.province || "",
                                    country: "España",
                                    email: fullInvoiceData.client.email || "",
                                    phone: fullInvoiceData.client.phone || "",
                                    client_type: "private",
                                  },
                                }

                                const filename = `borrador-${draft.invoice_id}.pdf`
                                const pdfBlob = await generatePdf(
                                  invoiceForPdf,
                                  fullInvoiceData.invoice_lines,
                                  filename,
                                  true,
                                )

                                if (pdfBlob && pdfBlob instanceof Blob) {
                                  const url = window.URL.createObjectURL(pdfBlob)
                                  const link = document.createElement("a")
                                  link.href = url
                                  link.download = filename
                                  document.body.appendChild(link)
                                  link.click()
                                  document.body.removeChild(link)
                                  window.URL.revokeObjectURL(url)
                                }
                              } catch (error) {
                                console.error("Error downloading draft:", error)
                                toast({
                                  title: "Error",
                                  description: "No se pudo descargar el borrador",
                                  variant: "destructive",
                                })
                              }
                            }}
                            className="h-7 w-7 p-0"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-600">
                        Total: {formatCurrency(draftInvoices.reduce((sum, draft) => sum + draft.total_amount, 0))}
                      </div>
                      <Button
                        onClick={issueAllDrafts}
                        disabled={issuing || generating}
                        className="gap-2 bg-green-600 hover:bg-green-700"
                      >
                        {issuing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Emitiendo...
                          </>
                        ) : (
                          <>
                            <Zap className="h-4 w-4" />
                            Emitir {draftInvoices.length} Facturas
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="text-sm text-gray-600">Total Clientes</p>
                        <p className="text-lg font-semibold">{clientsData.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-600">Seleccionados</p>
                        <p className="text-lg font-semibold">{selectedClients.size}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Euro className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-600">Total Seleccionado</p>
                        <p className="text-lg font-semibold">{formatCurrency(getTotalSelected())}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="text-sm text-gray-600">Total Citas/Actividades</p>
                        <p className="text-lg font-semibold">
                          {clientsData.reduce((sum, client) => sum + client.appointments.length, 0)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Status Summary */}
              <Card className="mb-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Estados de las citas y actividades</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(statusCounts).map(([status, count]) => (
                      <Badge
                        key={status}
                        variant="outline"
                        className={STATUS_COLORS[status as keyof typeof STATUS_COLORS] || "bg-gray-100 text-gray-800"}
                      >
                        {STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status}: {count}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Filters */}
              <div className="flex flex-wrap gap-4 mb-6">
                <div className="flex-1 min-w-64">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar por cliente, CIF, profesional..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filtrar por estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dataFilter} onValueChange={setDataFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filtrar por datos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los clientes</SelectItem>
                    <SelectItem value="complete">Datos completos</SelectItem>
                    <SelectItem value="incomplete">Datos incompletos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Controls */}
              <div className="flex gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={generating || issuing}>
                  Seleccionar Válidos (
                  {filteredClientsData.filter((c) => c.has_complete_data && c.invoiceable_appointments > 0).length})
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll} disabled={generating || issuing}>
                  Deseleccionar Todos
                </Button>
              </div>

              {/* Clients List */}
              <div className="space-y-3">
                {filteredClientsData.map((client) => {
                  const getClientStatusBadge = () => {
                    if (client.draft_appointments > 0) {
                      return (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                          <FileText className="h-3 w-3 mr-1" />
                          {client.draft_appointments} Borrador{client.draft_appointments > 1 ? "es" : ""}
                        </Badge>
                      )
                    } else if (client.invoiced_appointments > 0 && client.invoiceable_appointments === 0) {
                      return (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completamente facturado
                        </Badge>
                      )
                    } else if (client.invoiced_appointments > 0) {
                      return (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Parcialmente facturado
                        </Badge>
                      )
                    } else if (client.has_complete_data) {
                      return (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Datos completos
                        </Badge>
                      )
                    } else {
                      return (
                        <Badge variant="destructive">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Datos incompletos
                        </Badge>
                      )
                    }
                  }

                  return (
                    <Card
                      key={client.client_id}
                      className={`${
                        client.draft_appointments > 0
                          ? "border-amber-200 bg-amber-50"
                          : client.invoiced_appointments > 0 && client.invoiceable_appointments === 0
                            ? "border-green-200 bg-green-50 opacity-75"
                            : !client.has_complete_data
                              ? "border-red-200 bg-red-50"
                              : selectedClients.has(client.client_id)
                                ? "border-blue-200 bg-blue-50"
                                : ""
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedClients.has(client.client_id)}
                            onCheckedChange={(checked) => handleClientToggle(client.client_id, checked as boolean)}
                            disabled={
                              !client.has_complete_data ||
                              generating ||
                              issuing ||
                              client.invoiceable_appointments === 0
                            }
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Link href={`/dashboard/clients/${client.client_id}`}>
                                <h3 className="font-medium text-gray-900 hover:text-blue-600 cursor-pointer transition-colors duration-200">
                                  {client.client_name}
                                </h3>
                              </Link>
                              <Link href={`/dashboard/clients/${client.client_id}`}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  title="Ver/editar datos del cliente"
                                >
                                  <User className="h-3 w-3" />
                                </Button>
                              </Link>
                              {getClientStatusBadge()}
                            </div>

                            {/* Mostrar información de facturación detallada */}
                            {(client.invoiced_appointments > 0 || client.draft_appointments > 0) && (
                              <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                                <div className="flex items-center gap-1 mb-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  <strong>Estado de facturación:</strong>
                                </div>
                                <div className="space-y-1">
                                  {client.invoiceable_appointments > 0 && (
                                    <p>• {client.invoiceable_appointments} citas pendientes de facturar</p>
                                  )}
                                  {client.draft_appointments > 0 && (
                                    <p>• {client.draft_appointments} borradores creados</p>
                                  )}
                                  {client.invoiced_appointments > 0 && (
                                    <p>• {client.invoiced_appointments} citas ya facturadas</p>
                                  )}
                                </div>
                              </div>
                            )}

                            {!client.has_complete_data && (
                              <div className="mb-3 p-2 bg-red-100 rounded text-sm text-red-800">
                                <strong>Faltan datos:</strong> {client.missing_fields.join(", ")}
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                              <div>
                                <p>
                                  <strong>CIF/NIF:</strong> {client.client_tax_id || "No especificado"}
                                </p>
                                <p>
                                  <strong>Email:</strong> {client.client_email || "No especificado"}
                                </p>
                              </div>
                              <div>
                                <p>
                                  <strong>Teléfono:</strong> {client.client_phone || "No especificado"}
                                </p>
                                <p>
                                  <strong>Citas/Actividades:</strong> {client.appointments.length}
                                </p>
                              </div>
                            </div>

                            {/* Selector de método de pago por cliente */}
                            {client.has_complete_data && client.invoiceable_appointments > 0 && (
                              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                                <div className="flex items-center gap-2 mb-2">
                                  <CreditCard className="h-4 w-4 text-blue-600" />
                                  <Label className="text-sm font-medium text-blue-900">Método de Pago</Label>
                                </div>
                                <div className="space-y-2">
                                  <Select
                                    value={clientPaymentMethods.get(client.client_id)?.method || "tarjeta"}
                                    onValueChange={(value) => handlePaymentMethodChange(client.client_id, value)}
                                    disabled={generating || issuing}
                                  >
                                    <SelectTrigger className="w-full bg-white">
                                      <SelectValue placeholder="Método de pago" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                                      <SelectItem value="efectivo">Efectivo</SelectItem>
                                      <SelectItem value="transferencia">Transferencia</SelectItem>
                                      <SelectItem value="paypal">PayPal</SelectItem>
                                      <SelectItem value="bizum">Bizum</SelectItem>
                                      <SelectItem value="otro">Otro</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {clientPaymentMethods.get(client.client_id)?.method === "otro" && (
                                    <Input
                                      placeholder="Especificar método"
                                      value={clientPaymentMethods.get(client.client_id)?.other || ""}
                                      onChange={(e) =>
                                        handlePaymentMethodChange(client.client_id, "otro", e.target.value)
                                      }
                                      className="text-sm bg-white"
                                      disabled={generating || issuing}
                                    />
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Mostrar detalles de cada cita con su estado de facturación */}
                            <div className="space-y-2 mb-3">
                              {client.appointments.map((apt, index) => {
                                const getAppointmentStatusColor = () => {
                                  switch (apt.invoice_status) {
                                    case "draft":
                                      return "bg-amber-50 border border-amber-200"
                                    case "issued":
                                      return "bg-blue-50 border border-blue-200"
                                    case "verified":
                                      return "bg-green-50 border border-green-200"
                                    default:
                                      return "bg-gray-50"
                                  }
                                }

                                const getInvoiceStatusBadge = () => {
                                  switch (apt.invoice_status) {
                                    case "draft":
                                      return (
                                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
                                          Borrador
                                        </Badge>
                                      )
                                    case "issued":
                                      return (
                                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                                          Emitida #{apt.invoice_info?.invoice_number}
                                        </Badge>
                                      )
                                    case "verified":
                                      return (
                                        <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                                          Verificada #{apt.invoice_info?.invoice_number}
                                        </Badge>
                                      )
                                    default:
                                      return null
                                  }
                                }

                                return (
                                  <div
                                    key={apt.id}
                                    className={`flex items-center justify-between text-sm p-2 rounded ${getAppointmentStatusColor()}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono">
                                        {apt.start_time}-{apt.end_time}
                                      </span>
                                      <span>({apt.professional_name})</span>
                                      {apt.type === "group_activity" && (
                                        <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs">
                                          Actividad Grupal
                                        </Badge>
                                      )}
                                      <Badge
                                        variant="outline"
                                        className={`text-xs ${
                                          STATUS_COLORS[apt.status as keyof typeof STATUS_COLORS] ||
                                          "bg-gray-100 text-gray-800"
                                        }`}
                                      >
                                        {STATUS_LABELS[apt.status as keyof typeof STATUS_LABELS] || apt.status}
                                      </Badge>
                                      {getInvoiceStatusBadge()}
                                    </div>
                                    <span
                                      className={`font-medium ${
                                        apt.invoice_status !== "none" ? "text-gray-500 line-through" : ""
                                      }`}
                                    >
                                      {formatCurrency(apt.service_price || 50)}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>

                            <div className="flex justify-between items-center">
                              <div className="text-sm text-gray-600">
                                {client.appointments.length} cita{client.appointments.length !== 1 ? "s" : ""}/actividad
                                {client.appointments.length !== 1 ? "es" : ""}
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-lg">
                                  {formatCurrency(client.total_amount)}
                                  {(client.invoiced_appointments > 0 || client.draft_appointments > 0) && (
                                    <span className="text-xs text-gray-500 block">(Solo citas pendientes)</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {selectedClients.size} cliente{selectedClients.size !== 1 ? "s" : ""} seleccionado
              {selectedClients.size !== 1 ? "s" : ""} • Total: {formatCurrency(getTotalSelected())}
            </div>
            <div className="flex gap-2">
              {generatedInvoices.length > 0 && (
                <Button onClick={downloadZipAgain} variant="outline" className="bg-green-50 border-green-200">
                  <Download className="h-4 w-4 mr-2" />
                  Descargar ZIP ({generatedInvoices.length})
                </Button>
              )}
              <Button
                onClick={generateDraftInvoices}
                disabled={selectedClients.size === 0 || generating || issuing}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {generating ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Creando borradores...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Crear {selectedClients.size} Borradores
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
