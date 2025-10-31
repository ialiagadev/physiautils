"use client"

import { useState, useEffect } from "react"
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from "date-fns"
import { es } from "date-fns/locale"
import Link from "next/link"
import {
  FileText,
  X,
  CheckCircle,
  Users,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Download,
  Zap,
  Package,
  CreditCard,
  Plus,
  Trash2,
  ShoppingCart,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// Added Accordion components for collapsible appointment list
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/app/contexts/auth-context"
import JSZip from "jszip"
import { useCenterContext } from "@/app/contexts/center-context"

interface WeeklyBillingModalProps {
  isOpen: boolean
  onClose: () => void
  selectedDate: Date
}

interface AppointmentData {
  id: string
  date: string
  start_time: string
  end_time: string
  professional_name: string
  consultation_name: string
  notes: string | null
  service_price: number
  service_vat_rate: number
  service_irpf_rate: number
  service_name?: string
  service_retention_rate: number
  status: string
  type: "appointment" | "group_activity"
  activity_name?: string
  is_invoiced: boolean
  invoice_info?: {
    invoice_number: string
    created_at: string
    id: string
  }
  // Client data embedded in each appointment
  client_id: number
  client_name: string
  client_tax_id: string | null
  client_address: string | null
  client_postal_code: string | null
  client_city: string | null
  client_province: string | null
  client_email: string | null
  client_phone: string | null
  has_complete_data: boolean
  missing_fields: string[]
  loyalty_card_id?: number | null
  custom_price?: number | null
  center_id: string | null // Added center_id
  client_cif?: string | null // Added for invoice validation
}

interface LoyaltyCard {
  id: number
  name: string | null
  total_price: number | null
  total_sessions: number
  completed_sessions: number
  invoice_id: number | null
  service_id: number | null
  service_name?: string
}

interface BillingProgress {
  phase: "validating" | "generating" | "creating_pdfs" | "creating_zip" | "completed" | "error"
  current: number
  total: number
  message: string
  errors: string[]
  currentAppointment?: string
  zipProgress?: number
}

interface GeneratedInvoice {
  invoiceNumber: string
  clientName: string
  appointmentInfo: string
  amount: number
  pdfBlob: Blob
  invoiceId: string
}

interface AdditionalService {
  id: string
  service_id: string
  service_name: string
  description: string
  quantity: number
  unit_price: number
  discount_percentage: number
  vat_rate: number
  irpf_rate: number
  retention_rate: number
  line_amount: number
}

interface Service {
  id: string
  name: string
  description: string | null
  price: number
  vat_rate: number
  irpf_rate: number
  retention_rate: number
  invoice_series_id: number | null // Added invoice_series_id to Service interface
}

interface InvoiceSeries {
  id: number
  name: string
  code: string
  is_default: boolean
  active: boolean
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

function EnhancedProgressBar({ progress }: { progress: BillingProgress }) {
  const getPhaseIcon = () => {
    switch (progress.phase) {
      case "validating":
        return <CheckCircle className="h-5 w-5 text-blue-500 animate-pulse" />
      case "generating":
        return <Zap className="h-5 w-5 text-yellow-500 animate-bounce" />
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
      case "generating":
        return "bg-yellow-500"
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
      case "generating":
        return "Generando facturas"
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
              {progress.currentAppointment ? `Procesando: ${progress.currentAppointment}` : progress.message}
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
            {["validating", "generating", "creating_pdfs", "creating_zip", "completed"].map((phase, index) => {
              const isActive = progress.phase === phase
              const isCompleted =
                ["validating", "generating", "creating_pdfs", "creating_zip", "completed"].indexOf(progress.phase) >
                index
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
                    {phase === "creating_pdfs" ? "PDFs" : phase === "creating_zip" ? "ZIP" : phase.replace("_", " ")}
                  </span>
                </div>
              )
            })}
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

export function WeeklyBillingModal({ isOpen, onClose, selectedDate }: WeeklyBillingModalProps) {
  const { userProfile } = useAuth()
  const { toast } = useToast()
  const { centers, activeCenter } = useCenterContext()

  const [appointmentsData, setAppointmentsData] = useState<AppointmentData[]>([])
  const [filteredAppointmentsData, setFilteredAppointmentsData] = useState<AppointmentData[]>([])
  const [selectedAppointments, setSelectedAppointments] = useState<Set<string>>(new Set())

  const [loyaltyCards, setLoyaltyCards] = useState<Map<number, LoyaltyCard>>(new Map())

  const [invoiceSeries, setInvoiceSeries] = useState<InvoiceSeries[]>([])
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null)
  const [loadingInvoiceSeries, setLoadingInvoiceSeries] = useState(false)
  const [appointmentInvoiceSeries, setAppointmentInvoiceSeries] = useState<Map<string, "global" | "service">>(new Map())

  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<BillingProgress | null>(null)
  const [generatedInvoices, setGeneratedInvoices] = useState<GeneratedInvoice[]>([])

  const [appointmentPaymentMethods, setAppointmentPaymentMethods] = useState<
    Map<
      string,
      {
        method: "tarjeta" | "efectivo" | "transferencia" | "paypal" | "bizum" | "otro"
        other?: string
      }
    >
  >(new Map())

  const [additionalServices, setAdditionalServices] = useState<Map<string, AdditionalService[]>>(new Map())
  const [availableServices, setAvailableServices] = useState<Service[]>([])
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [currentAppointmentId, setCurrentAppointmentId] = useState<string | null>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dataFilter, setDataFilter] = useState<string>("all")

  const [showServiceForm, setShowServiceForm] = useState<Map<string, boolean>>(new Map())
  const [newServiceData, setNewServiceData] = useState<
    Map<
      string,
      {
        service_id: string
        service_name: string
        quantity: number
        unit_price: number
        discount_percentage: number
        vat_rate: number
      }
    >
  >(new Map())

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  useEffect(() => {
    if (isOpen && userProfile?.organization_id) {
      loadWeekAppointments()
      loadAvailableServices()
      // loadInvoiceSeries() // Moved to its own useEffect
    }
  }, [isOpen, selectedDate, userProfile, activeCenter]) // Added activeCenter to dependencies

  // Load invoice series when modal opens
  useEffect(() => {
    if (isOpen && userProfile?.organization_id) {
      loadInvoiceSeries()
    }
  }, [isOpen, userProfile?.organization_id])

  useEffect(() => {
    let filtered = [...appointmentsData]

    if (searchTerm) {
      filtered = filtered.filter(
        (apt) =>
          apt.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          apt.client_tax_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          apt.professional_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          apt.consultation_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          apt.activity_name?.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((apt) => apt.status === statusFilter)
    }

    if (dataFilter === "complete") {
      filtered = filtered.filter((apt) => apt.has_complete_data)
    } else if (dataFilter === "incomplete") {
      filtered = filtered.filter((apt) => !apt.has_complete_data)
    }

    setFilteredAppointmentsData(filtered)
  }, [appointmentsData, searchTerm, statusFilter, dataFilter])

  const handlePaymentMethodChange = (appointmentId: string, method: string, other?: string) => {
    setAppointmentPaymentMethods((prev) => {
      const newMap = new Map(prev)
      newMap.set(appointmentId, {
        method: method as "tarjeta" | "efectivo" | "transferencia" | "paypal" | "bizum" | "otro",
        other: method === "otro" ? other : undefined,
      })
      return newMap
    })
  }

  const toggleServiceForm = (appointmentId: string) => {
    setShowServiceForm((prev) => {
      const newMap = new Map(prev)
      newMap.set(appointmentId, !newMap.get(appointmentId))
      return newMap
    })

    // Initialize form data if not exists
    if (!newServiceData.has(appointmentId)) {
      setNewServiceData((prev) => {
        const newMap = new Map(prev)
        newMap.set(appointmentId, {
          service_id: "",
          service_name: "",
          quantity: 1,
          unit_price: 0,
          discount_percentage: 0,
          vat_rate: 21,
        })
        return newMap
      })
    }
  }

  const updateNewServiceField = (appointmentId: string, field: string, value: any) => {
    setNewServiceData((prev) => {
      const newMap = new Map(prev)
      const currentData = newServiceData.get(appointmentId) || {
        service_id: "",
        service_name: "",
        quantity: 1,
        unit_price: 0,
        discount_percentage: 0,
        vat_rate: 21,
      }
      newMap.set(appointmentId, { ...currentData, [field]: value })
      return newMap
    })
  }

  const addServiceFromForm = (appointmentId: string) => {
    const formData = newServiceData.get(appointmentId)
    if (!formData || !formData.service_name || formData.unit_price <= 0) {
      return
    }

    const newService: AdditionalService = {
      id: crypto.randomUUID(),
      service_id: formData.service_id || crypto.randomUUID(),
      service_name: formData.service_name,
      description: formData.service_name,
      quantity: formData.quantity,
      unit_price: formData.unit_price,
      discount_percentage: formData.discount_percentage,
      vat_rate: formData.vat_rate,
      irpf_rate: 0,
      retention_rate: 0,
      line_amount: formData.quantity * formData.unit_price * (1 - formData.discount_percentage / 100),
    }

    setAdditionalServices((prev) => {
      const newMap = new Map(prev)
      const appointmentServices = newMap.get(appointmentId) || []
      newMap.set(appointmentId, [...appointmentServices, newService])
      return newMap
    })

    // Reset form
    setNewServiceData((prev) => {
      const newMap = new Map(prev)
      newMap.set(appointmentId, {
        service_id: "",
        service_name: "",
        quantity: 1,
        unit_price: 0,
        discount_percentage: 0,
        vat_rate: 21,
      })
      return newMap
    })

    setShowServiceForm((prev) => {
      const newMap = new Map(prev)
      newMap.set(appointmentId, false)
      return newMap
    })
  }

  const calculateFormTotal = (appointmentId: string) => {
    const formData = newServiceData.get(appointmentId)
    if (!formData) return 0
    return formData.quantity * formData.unit_price * (1 - formData.discount_percentage / 100)
  }

  const getAppointmentServiceSeries = (appointmentId: string): InvoiceSeries | null => {
    const appointment = appointmentsData.find((apt) => apt.id === appointmentId)
    if (!appointment) return null

    // Find the service for this appointment
    const service = availableServices.find((s) => s.name === appointment.service_name)
    if (!service?.invoice_series_id) return null

    // Find the series
    return invoiceSeries.find((series) => series.id === service.invoice_series_id) || null
  }

  const getEffectiveSeriesId = (appointment: AppointmentData): number | undefined => {
    const choice = appointmentInvoiceSeries.get(appointment.id) || "service" // Default to "service"

    if (choice === "service") {
      const serviceSeries = getAppointmentServiceSeries(appointment.id)
      if (serviceSeries) return serviceSeries.id
    }

    return selectedSeriesId ?? undefined
  }

  const handleInvoiceSeriesChange = (appointmentId: string, choice: "global" | "service") => {
    setAppointmentInvoiceSeries((prev) => {
      const newMap = new Map(prev)
      newMap.set(appointmentId, choice)
      return newMap
    })
  }

  const loadAvailableServices = async () => {
    try {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, price, vat_rate, irpf_rate, retention_rate, invoice_series_id")
        .eq("organization_id", userProfile!.organization_id)
        .order("name")

      if (error) throw error
      setAvailableServices(data || [])
    } catch (error) {
      console.error("Error loading services:", error)
    }
  }

  const openServiceDialog = (appointmentId: string) => {
    setCurrentAppointmentId(appointmentId)
    setServiceDialogOpen(true)
  }

  const selectServiceForForm = (service: Service) => {
    if (!currentAppointmentId) return

    // Populate the form with selected service data
    setNewServiceData((prev) => {
      const newMap = new Map(prev)
      newMap.set(currentAppointmentId, {
        service_id: service.id,
        service_name: service.name,
        quantity: 1,
        unit_price: service.price,
        discount_percentage: 0,
        vat_rate: service.vat_rate,
      })
      return newMap
    })

    // Show the form if it's not already visible
    setShowServiceForm((prev) => {
      const newMap = new Map(prev)
      newMap.set(currentAppointmentId, true)
      return newMap
    })

    setServiceDialogOpen(false)
    setCurrentAppointmentId(null)

    toast({
      title: "Servicio seleccionado",
      description: `${service.name} - Completa los detalles y haz clic en Añadir`,
    })
  }

  const addServiceToAppointment = (service: Service) => {
    if (!currentAppointmentId) return

    const newService: AdditionalService = {
      id: crypto.randomUUID(),
      service_id: service.id,
      service_name: service.name,
      description: service.description || service.name,
      quantity: 1,
      unit_price: service.price,
      discount_percentage: 0,
      vat_rate: service.vat_rate,
      irpf_rate: service.irpf_rate,
      retention_rate: service.retention_rate,
      line_amount: service.price,
    }

    setAdditionalServices((prev) => {
      const newMap = new Map(prev)
      const appointmentServices = newMap.get(currentAppointmentId) || []
      newMap.set(currentAppointmentId, [...appointmentServices, newService])
      return newMap
    })

    setServiceDialogOpen(false)
    setCurrentAppointmentId(null)

    toast({
      title: "Servicio añadido",
      description: `${service.name} añadido a la cita`,
    })
  }

  const removeServiceFromAppointment = (appointmentId: string, serviceId: string) => {
    setAdditionalServices((prev) => {
      const newMap = new Map(prev)
      const appointmentServices = newMap.get(appointmentId) || []
      newMap.set(
        appointmentId,
        appointmentServices.filter((s) => s.id !== serviceId),
      )
      return newMap
    })
  }

  const updateServiceQuantity = (appointmentId: string, serviceId: string, quantity: number) => {
    if (quantity < 1) return

    setAdditionalServices((prev) => {
      const newMap = new Map(prev)
      const appointmentServices = newMap.get(appointmentId) || []
      newMap.set(
        appointmentId,
        appointmentServices.map((s) => {
          if (s.id === serviceId) {
            const lineAmount = quantity * s.unit_price * (1 - s.discount_percentage / 100)
            return { ...s, quantity, line_amount: lineAmount }
          }
          return s
        }),
      )
      return newMap
    })
  }

  const updateServiceDiscount = (appointmentId: string, serviceId: string, discount: number) => {
    if (discount < 0 || discount > 100) return

    setAdditionalServices((prev) => {
      const newMap = new Map(prev)
      const appointmentServices = newMap.get(appointmentId) || []
      newMap.set(
        appointmentId,
        appointmentServices.map((s) => {
          if (s.id === serviceId) {
            const lineAmount = s.quantity * s.unit_price * (1 - discount / 100)
            return { ...s, discount_percentage: discount, line_amount: lineAmount }
          }
          return s
        }),
      )
      return newMap
    })
  }

  const getAppointmentTotalWithServices = (appointmentId: string) => {
    const appointment = appointmentsData.find((apt) => apt.id === appointmentId)

    if (appointment?.loyalty_card_id) {
      const loyaltyCard = loyaltyCards.get(appointment.loyalty_card_id)
      return loyaltyCard?.total_price || 0
    }

    const baseTotal = appointment?.service_price || 0

    const aptServices = additionalServices.get(appointmentId) || []
    const additionalTotal = aptServices.reduce((sum, service) => sum + service.line_amount, 0)

    return baseTotal + additionalTotal
  }

  const loadWeekAppointments = async () => {
    setLoading(true)
    try {
      const weekStartStr = format(weekStart, "yyyy-MM-dd")
      const weekEndStr = format(weekEnd, "yyyy-MM-dd")

      let appointmentsQuery = supabase
        .from("appointments")
        .select(`
          id,
          date,
          start_time,
          end_time,
          notes,
          status,
          client_id,
          loyalty_card_id,
          center_id,
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
            retention_rate,
            invoice_series_id
          )
        `)
        .eq("organization_id", userProfile!.organization_id)
        .gte("date", weekStartStr)
        .lte("date", weekEndStr)
        .order("date")
        .order("start_time")

      if (centers.length > 1 && activeCenter) {
        appointmentsQuery = appointmentsQuery.eq("center_id", activeCenter.id)
      }

      const { data: appointments, error } = await appointmentsQuery

      if (error) throw error

      let groupActivitiesQuery = supabase
        .from("group_activities")
        .select(`
          id,
          name,
          date,
          start_time,
          end_time,
          professional_id,
          service_id,
          center_id,
          group_activity_participants (
            status,
            client_id,
            loyalty_card_id,
            custom_price,
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
        .gte("date", weekStartStr)
        .lte("date", weekEndStr)

      if (centers.length > 1 && activeCenter) {
        groupActivitiesQuery = groupActivitiesQuery.eq("center_id", activeCenter.id)
      }

      const { data: groupActivities, error: groupError } = await groupActivitiesQuery

      if (groupError) throw groupError

      // Load auxiliary data
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("id, name")
        .eq("organization_id", userProfile!.organization_id)
      if (usersError) throw usersError
      const users = usersData || []

      const { data: servicesData, error: servicesError } = await supabase
        .from("services")
        .select("id, name, price, vat_rate, irpf_rate, retention_rate, invoice_series_id")
        .eq("organization_id", userProfile!.organization_id)
      if (servicesError) throw servicesError
      const services = servicesData || []

      const loyaltyCardIds: number[] = []

      appointments?.forEach((apt: any) => {
        if (apt.loyalty_card_id) {
          loyaltyCardIds.push(apt.loyalty_card_id)
        }
      })

      groupActivities?.forEach((activity: any) => {
        activity.group_activity_participants?.forEach((participant: any) => {
          if (participant.loyalty_card_id) {
            loyaltyCardIds.push(participant.loyalty_card_id)
          }
        })
      })

      if (loyaltyCardIds.length > 0) {
        const { data: loyaltyCardsData, error: loyaltyError } = await supabase
          .from("loyalty_cards")
          .select(`
            id,
            name,
            total_price,
            total_sessions,
            completed_sessions,
            invoice_id,
            service_id,
            services (
              name
            )
          `)
          .in("id", loyaltyCardIds)

        if (!loyaltyError && loyaltyCardsData) {
          const cardsMap = new Map<number, LoyaltyCard>()
          loyaltyCardsData.forEach((card: any) => {
            cardsMap.set(card.id, {
              id: card.id,
              name: card.name,
              total_price: card.total_price,
              total_sessions: card.total_sessions,
              completed_sessions: card.completed_sessions,
              invoice_id: card.invoice_id,
              service_id: card.service_id,
              service_name: card.services?.name,
            })
          })
          setLoyaltyCards(cardsMap)
        }
      }

      const allAppointmentsData: AppointmentData[] = []

      // Process individual appointments
      appointments?.forEach((apt: any) => {
        const client = apt.clients

        if (!client) {
          console.warn(`Appointment ${apt.id} has no client data, skipping`)
          return
        }

        const missingFields: string[] = []

        // Check name has at least 2 words (name + surname)
        const nameParts = client.name?.trim().split(/\s+/) || []
        if (!client.name?.trim() || nameParts.length < 2) {
          missingFields.push("Nombre completo (nombre y apellido)")
        }

        if (!client.tax_id?.trim()) missingFields.push("CIF/NIF")

        allAppointmentsData.push({
          id: apt.id,
          date: apt.date,
          start_time: apt.start_time,
          end_time: apt.end_time,
          professional_name: apt.professional?.name || "Sin asignar",
          consultation_name: apt.consultation?.name || "Consulta general",
          notes: apt.notes,
          service_price: apt.services?.price || 50,
          service_name: apt.services?.name,
          service_vat_rate: apt.services?.vat_rate ?? 0,
          service_irpf_rate: apt.services?.irpf_rate ?? 0,
          service_retention_rate: apt.services?.retention_rate ?? 0,
          status: apt.status,
          type: "appointment",
          is_invoiced: false,
          client_id: client.id,
          client_name: client.name || "Sin nombre",
          client_tax_id: client.tax_id,
          client_address: client.address,
          client_postal_code: client.postal_code,
          client_city: client.city,
          client_province: client.province,
          client_email: client.email,
          client_phone: client.phone,
          has_complete_data: missingFields.length === 0,
          missing_fields: missingFields,
          loyalty_card_id: apt.loyalty_card_id,
          center_id: apt.center_id, // Added center_id
          client_cif: client.tax_id, // Added for invoice validation
        })
      })

      groupActivities?.forEach((activity: any) => {
        const professional = users.find((user) => user.id === activity.professional_id)
        const service = services.find((svc) => svc.id === activity.service_id)

        const validParticipants =
          activity.group_activity_participants?.filter(
            (p: any) => p.status === "attended" || p.status === "registered",
          ) || []

        validParticipants.forEach((participant: any) => {
          const client = participant.clients

          if (!client) {
            console.warn(`Participant ${participant.id} has no client data, skipping`)
            return
          }

          const missingFields: string[] = []

          // Check name has at least 2 words (name + surname)
          const nameParts = client.name?.trim().split(/\s+/) || []
          if (!client.name?.trim() || nameParts.length < 2) {
            missingFields.push("Nombre completo (nombre y apellido)")
          }

          if (!client.tax_id?.trim()) missingFields.push("CIF/NIF")

          const loyaltyCard = participant.loyalty_card_id ? loyaltyCards.get(participant.loyalty_card_id) : null
          const servicePrice = loyaltyCard
            ? loyaltyCard.total_price || 0
            : (participant.custom_price ?? service?.price ?? 50)

          allAppointmentsData.push({
            id: `group_${activity.id}_${participant.client_id}`,
            date: activity.date,
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
            is_invoiced: false,
            client_id: client.id,
            client_name: client.name || "Sin nombre",
            client_tax_id: client.tax_id,
            client_address: client.address,
            client_postal_code: client.postal_code,
            client_city: client.city,
            client_province: client.province,
            client_email: client.email,
            client_phone: client.phone,
            has_complete_data: missingFields.length === 0,
            missing_fields: missingFields,
            loyalty_card_id: participant.loyalty_card_id,
            custom_price: participant.custom_price,
            center_id: activity.center_id, // Added center_id
            client_cif: client.tax_id, // Added for invoice validation
          })
        })
      })

      setAppointmentsData(allAppointmentsData)

      // Check which appointments are already invoiced
      await checkExistingInvoices(allAppointmentsData, services)
    } catch (error) {
      console.error("Error loading appointments:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar las citas de la semana",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const checkExistingInvoices = async (
    appointments: AppointmentData[],
    services: Array<{ id: string; invoice_series_id: number | null; name: string }>,
  ) => {
    if (!userProfile?.organization_id || appointments.length === 0) return

    try {
      const initialSeriesMap = new Map<string, "global" | "service">()

      for (const appointment of appointments) {
        // Find the service for this appointment
        const service = services.find((s) => s.name === appointment.service_name)

        if (service?.invoice_series_id) {
          // Default to "service" if the service has a series
          initialSeriesMap.set(appointment.id, "service")
        } else {
          // Default to "global" if no service series
          initialSeriesMap.set(appointment.id, "global")
        }

        let query = supabase
          .from("invoices")
          .select("id, invoice_number, created_at")
          .eq("organization_id", userProfile.organization_id)

        if (appointment.type === "appointment") {
          query = query.eq("appointment_id", appointment.id)
        } else if (appointment.type === "group_activity") {
          const activityId = appointment.id.split("_")[1]
          query = query.eq("group_activity_id", activityId).eq("client_id", appointment.client_id)
        }

        const { data, error } = await query.limit(1)

        if (error) throw error

        if (data && data.length > 0) {
          appointment.is_invoiced = true
          appointment.invoice_info = {
            invoice_number: data[0].invoice_number,
            created_at: data[0].created_at,
            id: data[0].id,
          }
        }
      }

      setAppointmentInvoiceSeries(initialSeriesMap)

      const appointmentsToSelect = appointments
        .filter((apt) => {
          if (apt.is_invoiced || !apt.has_complete_data) return false

          // If appointment has loyalty_card_id, check if the loyalty card is already invoiced
          if (apt.loyalty_card_id) {
            const loyaltyCard = loyaltyCards.get(apt.loyalty_card_id)
            return loyaltyCard && !loyaltyCard.invoice_id
          }

          return true
        })
        .map((apt) => apt.id)

      setSelectedAppointments(new Set(appointmentsToSelect))
    } catch (error) {
      console.error("Error checking existing invoices:", error)
    }
  }

  const handleAppointmentToggle = (appointmentId: string, checked: boolean) => {
    const newSelected = new Set(selectedAppointments)

    if (checked) {
      const appointment = appointmentsData.find((apt) => apt.id === appointmentId)

      // If this appointment has a loyalty_card_id, check if another appointment with same loyalty_card_id is already selected
      if (appointment?.loyalty_card_id) {
        // Find any other selected appointment with the same loyalty_card_id
        const conflictingAppointment = appointmentsData.find(
          (apt) =>
            apt.loyalty_card_id === appointment.loyalty_card_id &&
            apt.id !== appointmentId &&
            selectedAppointments.has(apt.id),
        )

        // If there's a conflict, deselect the other appointment first
        if (conflictingAppointment) {
          newSelected.delete(conflictingAppointment.id)
        }
      }

      newSelected.add(appointmentId)
    } else {
      newSelected.delete(appointmentId)
    }

    setSelectedAppointments(newSelected)
  }

  const handleSelectAll = () => {
    const validAppointmentIds = filteredAppointmentsData
      .filter((apt) => {
        if (!apt.has_complete_data || apt.is_invoiced) return false

        if (apt.loyalty_card_id) {
          const loyaltyCard = loyaltyCards.get(apt.loyalty_card_id)
          return loyaltyCard && !loyaltyCard.invoice_id
        }

        return true
      })
      .map((apt) => apt.id)

    const selectedIds = new Set<string>()
    const usedLoyaltyCards = new Set<number>()

    validAppointmentIds.forEach((aptId) => {
      const apt = appointmentsData.find((a) => a.id === aptId)

      if (apt?.loyalty_card_id) {
        // Only add if we haven't seen this loyalty_card_id yet
        if (!usedLoyaltyCards.has(apt.loyalty_card_id)) {
          selectedIds.add(aptId)
          usedLoyaltyCards.add(apt.loyalty_card_id)
        }
      } else {
        // No loyalty card, always add
        selectedIds.add(aptId)
      }
    })

    setSelectedAppointments(selectedIds)
  }

  const handleDeselectAll = () => {
    setSelectedAppointments(new Set())
  }

  const generateInvoices = async () => {
    if (selectedAppointments.size === 0) return

    if (!selectedSeriesId) {
      toast({
        title: "Error",
        description: "Debes seleccionar una serie de factura",
        variant: "destructive",
      })
      return
    }

    setGenerating(true)
    setGeneratedInvoices([])

    const selectedAppointmentsArray = Array.from(selectedAppointments)

    setProgress({
      phase: "validating",
      current: 0,
      total: selectedAppointmentsArray.length,
      message: "🔍 Validando datos y preparando el proceso...",
      errors: [],
    })

    try {
      const { generateUniqueInvoiceNumber } = await import("@/lib/invoice-utils")
      const { generatePdf } = await import("@/lib/pdf-generator")
      const { savePdfToStorage } = await import("@/lib/storage-utils")

      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", userProfile!.organization_id)
        .single()

      if (orgError || !orgData) {
        throw new Error("No se pudieron obtener los datos de la organización")
      }

      let centerData = null
      if (orgData.invoice_by_center && activeCenter) {
        const { data: center, error: centerError } = await supabase
          .from("centers")
          .select("*")
          .eq("id", activeCenter.id)
          .single()

        if (!centerError && center) {
          centerData = center
        }
      }

      const fiscalData = centerData || orgData

      setProgress((prev) => ({
        ...prev!,
        phase: "generating",
        message: "⚡ Iniciando generación de facturas...",
      }))

      const errors: string[] = []
      let successCount = 0
      const invoicesForZip: GeneratedInvoice[] = []

      for (let i = 0; i < selectedAppointmentsArray.length; i++) {
        const appointmentId = selectedAppointmentsArray[i]
        const appointmentData = appointmentsData.find((apt) => apt.id === appointmentId)

        if (!appointmentData) {
          errors.push(`Error interno: No se encontró la cita con ID ${appointmentId}`)
          continue
        }

        const appointmentInfo = `${appointmentData.client_name} - ${format(new Date(appointmentData.date), "dd/MM/yyyy", { locale: es })} ${appointmentData.start_time}`

        setProgress((prev) => ({
          ...prev!,
          current: i + 1,
          message: `📄 Generando factura ${i + 1} de ${selectedAppointmentsArray.length}`,
          currentAppointment: appointmentInfo,
        }))

        try {
          const loyaltyCard = appointmentData.loyalty_card_id ? loyaltyCards.get(appointmentData.loyalty_card_id) : null
          const isLoyaltyCardAlreadyInvoiced = loyaltyCard?.invoice_id != null

          if (loyaltyCard && isLoyaltyCardAlreadyInvoiced) {
            errors.push(`${appointmentInfo}: El bono ya tiene una factura asociada`)
            continue
          }

          const { invoiceNumberFormatted, newInvoiceNumber } = await generateUniqueInvoiceNumber(
            userProfile!.organization_id,
            "normal",
            getEffectiveSeriesId(appointmentData) ?? undefined,
          )

          // Get payment method for this appointment
          const appointmentPaymentInfo = appointmentPaymentMethods.get(appointmentId) || { method: "tarjeta" }
          const paymentMethod = appointmentPaymentInfo.method
          const paymentMethodOther = appointmentPaymentInfo.other

          if (paymentMethod === "otro" && !paymentMethodOther?.trim()) {
            errors.push(`${appointmentInfo}: Método de pago 'Otro' sin especificar`)
            continue
          }

          let invoiceLines: any[]
          let subtotalAmount: number
          let totalDiscountAmount: number

          if (loyaltyCard) {
            // For loyalty cards, create a single line with the total_price
            const loyaltyCardPrice = loyaltyCard.total_price || 0

            invoiceLines = [
              {
                id: crypto.randomUUID(),
                description: `Bono: ${loyaltyCard.name || "Bono de sesiones"} - ${loyaltyCard.total_sessions} sesiones (${loyaltyCard.service_name || "Servicio"})`,
                quantity: 1,
                unit_price: loyaltyCardPrice,
                discount_percentage: 0,
                vat_rate: appointmentData.service_vat_rate,
                irpf_rate: appointmentData.service_irpf_rate,
                retention_rate: appointmentData.service_retention_rate,
                line_amount: loyaltyCardPrice,
                professional_id: null,
              },
            ]

            subtotalAmount = loyaltyCardPrice
            totalDiscountAmount = 0
          } else {
            // Regular appointment: main line + additional services
            const mainLine = {
              id: crypto.randomUUID(),
              description:
                appointmentData.type === "group_activity"
                  ? `Actividad Grupal: ${appointmentData.activity_name} - ${appointmentData.professional_name} (${format(new Date(appointmentData.date), "dd/MM/yyyy", { locale: es })} ${appointmentData.start_time}-${appointmentData.end_time})`
                  : `${appointmentData.service_name || "Servicio médico"} - ${appointmentData.professional_name} (${format(new Date(appointmentData.date), "dd/MM/yyyy", { locale: es })} ${appointmentData.start_time}-${appointmentData.end_time})`,
              quantity: 1,
              unit_price: appointmentData.custom_price || appointmentData.service_price, // Use custom_price for group activities
              discount_percentage: 0,
              vat_rate: appointmentData.service_vat_rate,
              irpf_rate: appointmentData.service_irpf_rate,
              retention_rate: appointmentData.service_retention_rate,
              line_amount: appointmentData.custom_price || appointmentData.service_price, // Use custom_price for group activities
              professional_id: null,
            }

            const aptAdditionalServices = additionalServices.get(appointmentId) || []
            const additionalLines = aptAdditionalServices.map((service) => ({
              id: service.id,
              description: `${service.description} (Servicio adicional)`,
              quantity: service.quantity,
              unit_price: service.unit_price,
              discount_percentage: service.discount_percentage,
              vat_rate: service.vat_rate,
              irpf_rate: service.irpf_rate,
              retention_rate: service.retention_rate,
              line_amount: service.line_amount,
              professional_id: null,
            }))

            invoiceLines = [mainLine, ...additionalLines]

            subtotalAmount = invoiceLines.reduce((sum, line) => {
              return sum + line.quantity * line.unit_price
            }, 0)

            totalDiscountAmount = invoiceLines.reduce((sum, line) => {
              const lineSubtotal = line.quantity * line.unit_price
              const lineDiscount = (lineSubtotal * line.discount_percentage) / 100
              return sum + lineDiscount
            }, 0)
          }

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

          const clientInfoText = `Cliente: ${appointmentData.client_name}, CIF/NIF: ${appointmentData.client_tax_id}, Dirección: ${appointmentData.client_address}, ${appointmentData.client_postal_code} ${appointmentData.client_city}, ${appointmentData.client_province}`
          const additionalNotes = loyaltyCard
            ? `Factura generada para bono de ${loyaltyCard.total_sessions} sesiones`
            : `Factura generada para cita del ${format(new Date(appointmentData.date), "dd/MM/yyyy", { locale: es })} a las ${appointmentData.start_time}`

          const notaIVAExenta =
            vatAmount === 0 && baseAmount > 0
              ? "\n\nOperación exenta de IVA conforme al artículo 20. Uno. 3º de la Ley 37/1992 del Impuesto sobre el Valor Añadido, por tratarse de un servicio de asistencia sanitaria prestado por profesional titulado"
              : ""

          const fullNotes = clientInfoText + "\n\n" + additionalNotes + notaIVAExenta

          const { data: invoiceData, error: invoiceError } = await supabase
            .from("invoices")
            .insert({
              organization_id: userProfile!.organization_id,
              invoice_number: invoiceNumberFormatted,
              invoice_series_id: getEffectiveSeriesId(appointmentData),
              client_id: appointmentData.client_id,
              appointment_id: appointmentData.type === "appointment" ? appointmentData.id : null,
              group_activity_id: appointmentData.type === "group_activity" ? appointmentData.id.split("_")[1] : null,
              issue_date: format(selectedDate, "yyyy-MM-dd"),
              invoice_type: "normal" as const,
              status: "paid",
              base_amount: baseAmount,
              vat_amount: vatAmount,
              irpf_amount: irpfAmount,
              retention_amount: retentionAmount,
              total_amount: totalAmount,
              discount_amount: totalDiscountAmount,
              notes: fullNotes,
              payment_method: paymentMethod,
              payment_method_other: paymentMethod === "otro" ? paymentMethodOther : null,
              center_id: appointmentData.center_id,
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

          if (loyaltyCard) {
            const { error: updateLoyaltyError } = await supabase
              .from("loyalty_cards")
              .update({ invoice_id: invoiceData.id })
              .eq("id", loyaltyCard.id)

            if (updateLoyaltyError) {
              console.error("Error updating loyalty card:", updateLoyaltyError)
            }
          }

          const { error: updateSeriesError } = await supabase
            .from("invoice_series")
            .update({ last_number: newInvoiceNumber })
            .eq("id", getEffectiveSeriesId(appointmentData)) // Use getEffectiveSeriesId here
            .eq("organization_id", userProfile!.organization_id)

          if (updateSeriesError) {
            console.error("Error updating invoice series:", updateSeriesError)
          }

          setProgress((prev) => ({
            ...prev!,
            phase: "creating_pdfs",
            message: `📄 Generando PDF para ${appointmentInfo}...`,
            currentAppointment: appointmentInfo,
          }))

          try {
            const organizationForPdf = {
              name: fiscalData.name,
              tax_id: fiscalData.tax_id,
              address: fiscalData.address,
              postal_code: fiscalData.postal_code,
              city: fiscalData.city,
              province: fiscalData.province,
              country: fiscalData.country || "España",
              email: fiscalData.email,
              phone: fiscalData.phone,
              invoice_prefix: orgData.invoice_prefix,
              logo_url: orgData.logo_url,
              logo_path: orgData.logo_path,
            }

            const clientDataForPdf = {
              name: appointmentData.client_name,
              tax_id: appointmentData.client_tax_id || "",
              address: appointmentData.client_address || "",
              postal_code: appointmentData.client_postal_code || "",
              city: appointmentData.client_city || "",
              province: appointmentData.client_province || "",
              country: "España",
              email: appointmentData.client_email || "",
              phone: appointmentData.client_phone || "",
              client_type: "private",
            }

            const newInvoice = {
              id: invoiceData.id,
              invoice_number: invoiceNumberFormatted,
              issue_date: format(selectedDate, "yyyy-MM-dd"),
              invoice_type: "normal" as const,
              status: "paid",
              base_amount: baseAmount,
              vat_amount: vatAmount,
              irpf_amount: irpfAmount,
              retention_amount: retentionAmount,
              total_amount: totalAmount,
              discount_amount: totalDiscountAmount,
              notes: fullNotes,
              signature: null,
              payment_method: paymentMethod,
              payment_method_other: paymentMethod === "otro" ? paymentMethodOther : null,
              organization: organizationForPdf,
              client_data: clientDataForPdf,
              center_data:
                centerData && orgData.invoice_by_center
                  ? {
                      id: centerData.id,
                      name: centerData.name,
                      tax_id: centerData.tax_id,
                      address: centerData.address,
                      postal_code: centerData.postal_code,
                      city: centerData.city,
                      province: centerData.province,
                      country: centerData.country,
                      email: centerData.email,
                      phone: centerData.phone,
                    }
                  : null,
            }

            const pdfBlob = await generatePdf(newInvoice, invoiceLines, `factura-${invoiceNumberFormatted}.pdf`, false)

            if (pdfBlob && pdfBlob instanceof Blob) {
              invoicesForZip.push({
                invoiceNumber: invoiceNumberFormatted,
                clientName: appointmentData.client_name,
                appointmentInfo: appointmentInfo,
                amount: totalAmount,
                pdfBlob: pdfBlob,
                invoiceId: invoiceData.id,
              })

              try {
                const pdfUrl = await savePdfToStorage(
                  pdfBlob,
                  `factura-${invoiceNumberFormatted}.pdf`,
                  userProfile!.organization_id,
                )

                await supabase.from("invoices").update({ pdf_url: pdfUrl }).eq("id", invoiceData.id)
              } catch (pdfError) {
                console.error("Error saving PDF:", pdfError)
              }
            }
          } catch (pdfError) {
            console.error("Error generating PDF:", pdfError)
          }

          successCount++

          // Mark appointment as invoiced
          setAppointmentsData((prevAppointments) =>
            prevAppointments.map((apt) => {
              if (apt.id === appointmentId) {
                return {
                  ...apt,
                  is_invoiced: true,
                  invoice_info: {
                    invoice_number: invoiceNumberFormatted,
                    created_at: invoiceData.created_at,
                    id: invoiceData.id,
                  },
                }
              }
              return apt
            }),
          )

          // Remove from selected
          setSelectedAppointments((prev) => {
            const newSet = new Set(prev)
            newSet.delete(appointmentId)
            return newSet
          })

          // Clear additional services for this appointment
          setAdditionalServices((prev) => {
            const newMap = new Map(prev)
            newMap.delete(appointmentId)
            return newMap
          })
        } catch (error) {
          console.error(`Error generating invoice for appointment ${appointmentInfo}:`, error)
          errors.push(`${appointmentInfo}: ${error instanceof Error ? error.message : "Error desconocido"}`)
        }

        await new Promise((resolve) => setTimeout(resolve, 300))
      }

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

        const url = URL.createObjectURL(zipBlob)
        const a = document.createElement("a")
        a.href = url
        a.download = `facturas-semana-${format(weekStart, "dd-MM-yyyy", { locale: es })}-al-${format(weekEnd, "dd-MM-yyyy", { locale: es })}.zip`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        setProgress((prev) => ({
          ...prev!,
          phase: "completed",
          message: `✅ ¡Proceso completado! ${successCount} facturas generadas correctamente`,
          zipProgress: 100,
        }))

        setGeneratedInvoices(invoicesForZip)

        toast({
          title: "✅ Facturas generadas",
          description: `Se generaron ${successCount} facturas correctamente. El archivo ZIP se descargó automáticamente.`,
        })
      }

      if (errors.length > 0) {
        setProgress((prev) => ({
          ...prev!,
          errors: errors,
        }))
      }
    } catch (error) {
      console.error("Error in generateInvoices:", error)
      setProgress({
        phase: "error",
        current: 0,
        total: 0,
        message: `❌ Error: ${error instanceof Error ? error.message : "Error desconocido"}`,
        errors: [error instanceof Error ? error.message : "Error desconocido"],
      })

      toast({
        title: "Error",
        description: "Hubo un error al generar las facturas",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  const downloadZipAgain = async () => {
    if (generatedInvoices.length === 0) return

    const zip = new JSZip()

    for (const invoice of generatedInvoices) {
      const cleanClientName = invoice.clientName
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .replace(/\s+/g, "_")
        .substring(0, 30)

      const fileName = `${invoice.invoiceNumber}_${cleanClientName}.pdf`
      zip.file(fileName, invoice.pdfBlob)
    }

    const zipBlob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    })

    const url = URL.createObjectURL(zipBlob)
    const a = document.createElement("a")
    a.href = url
    a.download = `facturas-semana-${format(weekStart, "dd-MM-yyyy", { locale: es })}-al-${format(weekEnd, "dd-MM-yyyy", { locale: es })}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(amount)
  }

  const getTotalSelected = () => {
    return Array.from(selectedAppointments).reduce((sum, appointmentId) => {
      return sum + getAppointmentTotalWithServices(appointmentId)
    }, 0)
  }

  const getStatusCounts = () => {
    const counts: Record<string, number> = {}
    appointmentsData.forEach((apt) => {
      counts[apt.status] = (counts[apt.status] || 0) + 1
    })
    return counts
  }

  const loadInvoiceSeries = async () => {
    if (!userProfile?.organization_id) return

    setLoadingInvoiceSeries(true)
    try {
      const { data, error } = await supabase
        .from("invoice_series")
        .select("id, name, code, is_default, active")
        .eq("organization_id", userProfile.organization_id)
        .eq("active", true)
        .order("is_default", { ascending: false })
        .order("name")

      if (error) throw error

      setInvoiceSeries(data || [])

      // Auto-select default series
      const defaultSeries = data?.find((s) => s.is_default)
      if (defaultSeries) {
        setSelectedSeriesId(defaultSeries.id)
      } else if (data && data.length > 0) {
        setSelectedSeriesId(data[0].id)
      }
    } catch (error) {
      console.error("Error loading invoice series:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar las series de factura",
        variant: "destructive",
      })
    } finally {
      setLoadingInvoiceSeries(false)
    }
  }

  if (!isOpen) return null

  const statusCounts = getStatusCounts()
  const uniqueClients = new Set(appointmentsData.map((apt) => apt.client_id)).size

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Facturación Semanal</h2>
            <p className="text-sm text-gray-600 mt-1">
              {format(weekStart, "dd MMM", { locale: es })} - {format(weekEnd, "dd MMM yyyy", { locale: es })}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={generating}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Clock className="h-8 w-8 animate-spin text-purple-600 mr-3" />
              <span className="text-lg text-gray-600">Cargando citas...</span>
            </div>
          ) : (
            <>
              {progress && <EnhancedProgressBar progress={progress} />}

              {/* Invoice Series Selection */}
              <Card className="mb-6 border-2 border-purple-200 bg-purple-50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-purple-900">Serie de Factura</CardTitle>
                  <p className="text-sm text-gray-600">Selecciona la serie para todas las facturas de esta semana</p>
                </CardHeader>
                <CardContent>
                  {loadingInvoiceSeries ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Clock className="h-4 w-4 animate-spin" />
                      <span>Cargando series...</span>
                    </div>
                  ) : invoiceSeries.length === 0 ? (
                    <div className="text-sm text-red-600">
                      No hay series de factura activas. Configura una serie en Ajustes.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="invoice-series" className="text-sm font-medium">
                        Serie
                      </Label>
                      <Select
                        value={selectedSeriesId?.toString() || ""}
                        onValueChange={(value) => setSelectedSeriesId(Number.parseInt(value))}
                        disabled={generating || invoiceSeries.length === 1}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Selecciona una serie" />
                        </SelectTrigger>
                        <SelectContent>
                          {invoiceSeries.map((series) => (
                            <SelectItem key={series.id} value={series.id.toString()}>
                              {series.name} ({series.code}){series.is_default && " - Predeterminada"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {invoiceSeries.length === 1 && (
                        <p className="text-xs text-gray-500">Solo hay una serie disponible: {invoiceSeries[0].name}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-purple-600" />
                      <div>
                        <p className="text-sm text-gray-600">Total Citas</p>
                        <p className="text-lg font-semibold">{appointmentsData.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="text-sm text-gray-600">Clientes Únicos</p>
                        <p className="text-lg font-semibold">{uniqueClients}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-600">Seleccionadas</p>
                        <p className="text-lg font-semibold">{selectedAppointments.size}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Removed Euro card as it's redundant with footer total */}
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
              <div className="flex flex-wrap gap-3 mb-4">
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
                    <SelectItem value="all">Todas las citas</SelectItem>
                    <SelectItem value="complete">Datos completos</SelectItem>
                    <SelectItem value="incomplete">Datos incompletos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Controls */}
              <div className="flex gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={generating}>
                  Seleccionar Válidas (
                  {
                    filteredAppointmentsData.filter((apt) => {
                      if (!apt.has_complete_data || apt.is_invoiced) return false
                      if (apt.loyalty_card_id) {
                        const loyaltyCard = loyaltyCards.get(apt.loyalty_card_id)
                        return loyaltyCard && !loyaltyCard.invoice_id
                      }
                      return true
                    }).length
                  }
                  )
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll} disabled={generating}>
                  Deseleccionar Todas
                </Button>
              </div>

              {/* Accordion for grouping by day */}
              <div className="space-y-4">
                {weekDays.map((day) => {
                  const dayAppointments = filteredAppointmentsData.filter(
                    (apt) => format(new Date(apt.date), "yyyy-MM-dd") === format(day, "yyyy-MM-dd"),
                  )

                  if (dayAppointments.length === 0) return null

                  return (
                    <Card key={format(day, "yyyy-MM-dd")} className="border-2">
                      <CardHeader className="pb-3 bg-gray-50">
                        <CardTitle className="text-base font-semibold text-gray-900">
                          {format(day, "EEEE, dd 'de' MMMM", { locale: es })}
                          <span className="text-sm font-normal text-gray-600 ml-2">
                            ({dayAppointments.length} cita{dayAppointments.length !== 1 ? "s" : ""})
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4">
                        <Accordion type="multiple" className="space-y-2">
                          {dayAppointments.map((apt) => {
                            const aptServices = additionalServices.get(apt.id) || []
                            const hasServices = aptServices.length > 0
                            const isSelected = selectedAppointments.has(apt.id)

                            const loyaltyCard = apt.loyalty_card_id ? loyaltyCards.get(apt.loyalty_card_id) : null
                            const isLoyaltyCardAlreadyInvoiced = loyaltyCard?.invoice_id != null
                            const serviceSeries = getAppointmentServiceSeries(apt.id)

                            const hasConflictingSelection =
                              apt.loyalty_card_id && !isSelected
                                ? appointmentsData.some(
                                    (otherApt) =>
                                      otherApt.loyalty_card_id === apt.loyalty_card_id &&
                                      otherApt.id !== apt.id &&
                                      selectedAppointments.has(otherApt.id),
                                  )
                                : false

                            return (
                              <AccordionItem
                                key={apt.id}
                                value={apt.id}
                                className={`border rounded-lg ${
                                  apt.is_invoiced || isLoyaltyCardAlreadyInvoiced
                                    ? "border-yellow-200 bg-yellow-50"
                                    : !apt.has_complete_data
                                      ? "border-red-200 bg-red-50"
                                      : loyaltyCard
                                        ? "border-purple-300 bg-purple-50"
                                        : isSelected
                                          ? "border-purple-200 bg-purple-50"
                                          : "border-gray-200"
                                }`}
                              >
                                <AccordionTrigger
                                  className="px-4 hover:no-underline hover:bg-muted/50 transition-colors group"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={(checked) => handleAppointmentToggle(apt.id, checked as boolean)}
                                      disabled={
                                        !apt.has_complete_data ||
                                        generating ||
                                        apt.is_invoiced ||
                                        isLoyaltyCardAlreadyInvoiced ||
                                        hasConflictingSelection
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <div className="flex-1 text-left">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-sm font-medium">
                                          {apt.start_time}-{apt.end_time}
                                        </span>
                                        <Link href={`/dashboard/clients/${apt.client_id}`}>
                                          <span className="font-medium text-gray-900 hover:text-purple-600 cursor-pointer transition-colors">
                                            {apt.client_name}
                                          </span>
                                        </Link>

                                        {/* Badges */}
                                        {apt.type === "group_activity" && (
                                          <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs">
                                            Actividad Grupal
                                          </Badge>
                                        )}

                                        {loyaltyCard && !isLoyaltyCardAlreadyInvoiced && (
                                          <Badge variant="secondary" className="bg-purple-500 text-white text-xs">
                                            Bono
                                          </Badge>
                                        )}

                                        {isLoyaltyCardAlreadyInvoiced && (
                                          <Badge variant="secondary" className="bg-orange-100 text-orange-800 text-xs">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            Bono Ya Facturado
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

                                        {apt.is_invoiced ? (
                                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            Facturada #{apt.invoice_info?.invoice_number}
                                          </Badge>
                                        ) : apt.has_complete_data ? (
                                          <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                                            <CheckCircle className="h-3 w-3 mr-1" />
                                            Datos completos
                                          </Badge>
                                        ) : (
                                          <Badge variant="destructive" className="text-xs">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            Datos incompletos
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        {apt.service_name || "Servicio médico"} | {apt.professional_name}
                                      </p>
                                    </div>
                                    <div className="text-right flex items-center gap-2">
                                      <div>
                                        <p className="font-semibold text-lg">
                                          {formatCurrency(getAppointmentTotalWithServices(apt.id))}
                                        </p>
                                      </div>
                                      <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                    </div>
                                  </div>
                                </AccordionTrigger>

                                {!apt.is_invoiced && !isLoyaltyCardAlreadyInvoiced && serviceSeries && (
                                  <div className="px-4 pt-2 pb-0">
                                    <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                                      <div className="flex items-start gap-2 mb-2">
                                        <FileText className="h-4 w-4 text-green-600 mt-0.5" />
                                        <div className="flex-1">
                                          <p className="text-sm font-medium text-green-800">Serie de Factura</p>
                                          <p className="text-xs text-green-600 mt-0.5">
                                            Este servicio tiene una serie específica asociada. Elige cuál usar:
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex gap-2 mt-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={
                                            appointmentInvoiceSeries.get(apt.id) === "service" ? "default" : "outline"
                                          }
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleInvoiceSeriesChange(apt.id, "service")
                                          }}
                                          className="flex-1"
                                          disabled={generating}
                                        >
                                          Servicio {serviceSeries.code}
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant={
                                            appointmentInvoiceSeries.get(apt.id) === "global" ||
                                            !appointmentInvoiceSeries.has(apt.id)
                                              ? "default"
                                              : "outline"
                                          }
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleInvoiceSeriesChange(apt.id, "global")
                                          }}
                                          className="flex-1"
                                          disabled={generating}
                                        >
                                          Global {invoiceSeries.find((s) => s.id === selectedSeriesId)?.code}
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <AccordionContent className="px-4 pb-4">
                                  <div className="space-y-4 pt-4">
                                    {/* Missing data warning */}
                                    {!apt.has_complete_data && (
                                      <div className="p-2 bg-red-100 rounded text-sm text-red-800">
                                        <strong>Faltan datos del cliente:</strong> {apt.missing_fields.join(", ")}
                                      </div>
                                    )}

                                    {/* Loyalty card info */}
                                    {loyaltyCard && (
                                      <div className="p-3 bg-purple-100 border border-purple-200 rounded">
                                        <div className="text-sm">
                                          <p className="font-medium text-purple-900">
                                            {loyaltyCard.name || "Bono de sesiones"}
                                          </p>
                                          <p className="text-purple-700">
                                            {loyaltyCard.total_sessions} sesiones •{" "}
                                            {formatCurrency(loyaltyCard.total_price || 0)}
                                          </p>
                                          {loyaltyCard.service_name && (
                                            <p className="text-xs text-purple-600 mt-1">
                                              Servicio: {loyaltyCard.service_name}
                                            </p>
                                          )}
                                          {isLoyaltyCardAlreadyInvoiced && (
                                            <p className="text-xs text-orange-700 mt-2 font-medium">
                                              Este bono ya ha sido facturado y no se puede volver a facturar
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Client info */}
                                    <div className="text-sm text-gray-600">
                                      <p>
                                        <strong>CIF/NIF:</strong> {apt.client_tax_id || "No especificado"}
                                      </p>
                                      <p>
                                        <strong>Email:</strong> {apt.client_email || "No especificado"}
                                      </p>
                                      <p>
                                        <strong>Teléfono:</strong> {apt.client_phone || "No especificado"}
                                      </p>
                                    </div>

                                    {/* Payment method selector */}
                                    {apt.has_complete_data &&
                                      !apt.is_invoiced &&
                                      !isLoyaltyCardAlreadyInvoiced &&
                                      !loyaltyCard && (
                                        <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                                          <div className="flex items-center gap-2 mb-2">
                                            <CreditCard className="h-4 w-4 text-purple-600" />
                                            <Label className="text-sm font-medium text-purple-900">
                                              Método de Pago
                                            </Label>
                                          </div>
                                          <div className="space-y-2">
                                            <Select
                                              value={appointmentPaymentMethods.get(apt.id)?.method || "tarjeta"}
                                              onValueChange={(value) => handlePaymentMethodChange(apt.id, value)}
                                              disabled={generating}
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
                                            {appointmentPaymentMethods.get(apt.id)?.method === "otro" && (
                                              <Input
                                                placeholder="Especificar método"
                                                value={appointmentPaymentMethods.get(apt.id)?.other || ""}
                                                onChange={(e) =>
                                                  handlePaymentMethodChange(apt.id, "otro", e.target.value)
                                                }
                                                className="text-sm bg-white"
                                                disabled={generating}
                                              />
                                            )}
                                          </div>
                                        </div>
                                      )}

                                    {/* Additional services */}
                                    {hasServices && !loyaltyCard && (
                                      <div className="space-y-2">
                                        <h4 className="text-sm font-medium text-purple-900 flex items-center gap-1">
                                          <ShoppingCart className="h-3 w-3" />
                                          Servicios Adicionales
                                        </h4>
                                        {aptServices.map((service) => (
                                          <div
                                            key={service.id}
                                            className="flex items-center justify-between text-sm p-2 bg-purple-50 rounded border border-purple-100"
                                          >
                                            <div className="flex-1">
                                              <div className="font-medium text-purple-900">{service.service_name}</div>
                                              <p className="text-xs text-gray-600">{service.description}</p>
                                              <div className="flex gap-2 mt-1">
                                                <Input
                                                  type="number"
                                                  min="1"
                                                  value={service.quantity}
                                                  onChange={(e) =>
                                                    updateServiceQuantity(
                                                      apt.id,
                                                      service.id,
                                                      Number.parseInt(e.target.value),
                                                    )
                                                  }
                                                  className="w-16 h-6 text-xs"
                                                  disabled={generating}
                                                />
                                                <span className="text-xs text-gray-500 self-center">x</span>
                                                <span className="text-xs text-gray-700 self-center">
                                                  {formatCurrency(service.unit_price)}
                                                </span>
                                                <Input
                                                  type="number"
                                                  min="0"
                                                  max="100"
                                                  value={service.discount_percentage}
                                                  onChange={(e) =>
                                                    updateServiceDiscount(
                                                      apt.id,
                                                      service.id,
                                                      Number.parseFloat(e.target.value),
                                                    )
                                                  }
                                                  className="w-16 h-6 text-xs"
                                                  placeholder="Desc %"
                                                  disabled={generating}
                                                />
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-purple-700">
                                                {formatCurrency(service.line_amount)}
                                              </span>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeServiceFromAppointment(apt.id, service.id)}
                                                disabled={generating}
                                                className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Add service button */}
                                    {!apt.is_invoiced &&
                                      apt.has_complete_data &&
                                      !loyaltyCard &&
                                      !isLoyaltyCardAlreadyInvoiced && (
                                        <div className="mt-4 space-y-3">
                                          {!showServiceForm.get(apt.id) ? (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => toggleServiceForm(apt.id)}
                                              disabled={generating}
                                              className="w-full text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                            >
                                              <Plus className="h-3 w-3 mr-1" />
                                              Añadir Servicio
                                            </Button>
                                          ) : (
                                            <div className="border rounded-lg p-4 bg-purple-50/50 space-y-3">
                                              <h4 className="font-medium text-sm mb-3">Nuevo Servicio</h4>

                                              <div>
                                                <label className="text-xs font-medium text-gray-700 mb-1 block">
                                                  Servicio
                                                </label>
                                                <Button
                                                  type="button"
                                                  variant="outline"
                                                  size="sm"
                                                  className="w-full justify-start text-sm h-10 bg-white"
                                                  onClick={() => openServiceDialog(apt.id)}
                                                  disabled={generating}
                                                >
                                                  {newServiceData.get(apt.id)?.service_name || "Seleccionar servicio"}
                                                </Button>
                                              </div>

                                              {/* Quantity, Price, Discount, IVA in a grid */}
                                              <div className="grid grid-cols-4 gap-2">
                                                <div>
                                                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                                                    Cantidad
                                                  </label>
                                                  <Input
                                                    type="number"
                                                    min="1"
                                                    value={newServiceData.get(apt.id)?.quantity || 1}
                                                    onChange={(e) =>
                                                      updateNewServiceField(
                                                        apt.id,
                                                        "quantity",
                                                        Number.parseInt(e.target.value) || 1,
                                                      )
                                                    }
                                                    disabled={generating}
                                                    className="bg-white"
                                                  />
                                                </div>

                                                <div>
                                                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                                                    Precio (€)
                                                  </label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={newServiceData.get(apt.id)?.unit_price || 0}
                                                    onChange={(e) =>
                                                      updateNewServiceField(
                                                        apt.id,
                                                        "unit_price",
                                                        Number.parseFloat(e.target.value) || 0,
                                                      )
                                                    }
                                                    disabled={generating}
                                                    className="bg-white"
                                                  />
                                                </div>

                                                <div>
                                                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                                                    Descuento (%)
                                                  </label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={newServiceData.get(apt.id)?.discount_percentage || 0}
                                                    onChange={(e) =>
                                                      updateNewServiceField(
                                                        apt.id,
                                                        "discount_percentage",
                                                        Number.parseFloat(e.target.value) || 0,
                                                      )
                                                    }
                                                    disabled={generating}
                                                    className="bg-white"
                                                  />
                                                </div>

                                                <div>
                                                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                                                    IVA (%)
                                                  </label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={newServiceData.get(apt.id)?.vat_rate || 21}
                                                    onChange={(e) =>
                                                      updateNewServiceField(
                                                        apt.id,
                                                        "vat_rate",
                                                        Number.parseFloat(e.target.value) || 21,
                                                      )
                                                    }
                                                    disabled={generating}
                                                    className="bg-white"
                                                  />
                                                </div>
                                              </div>

                                              {/* Total display */}
                                              <div className="flex justify-end items-center pt-2 border-t">
                                                <span className="text-sm font-medium text-gray-600 mr-2">Importe:</span>
                                                <span className="text-lg font-semibold text-purple-700">
                                                  {formatCurrency(calculateFormTotal(apt.id))}
                                                </span>
                                              </div>

                                              {/* Action buttons */}
                                              <div className="flex gap-2 pt-2">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => toggleServiceForm(apt.id)}
                                                  disabled={generating}
                                                  className="flex-1"
                                                >
                                                  Cancelar
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  onClick={() => addServiceFromForm(apt.id)}
                                                  disabled={
                                                    generating ||
                                                    !newServiceData.get(apt.id)?.service_name ||
                                                    (newServiceData.get(apt.id)?.unit_price || 0) <= 0
                                                  }
                                                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                                                >
                                                  <Plus className="h-3 w-3 mr-1" />
                                                  Añadir
                                                </Button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            )
                          })}
                        </Accordion>
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
              {selectedAppointments.size} cita{selectedAppointments.size !== 1 ? "s" : ""} seleccionada
              {selectedAppointments.size !== 1 ? "s" : ""} • Total: {formatCurrency(getTotalSelected())}
            </div>
            <div className="flex gap-2">
              {generatedInvoices.length > 0 && (
                <Button onClick={downloadZipAgain} variant="outline" className="bg-green-50 border-green-200">
                  <Download className="h-4 w-4 mr-2" />
                  Descargar ZIP ({generatedInvoices.length})
                </Button>
              )}
              <Button
                onClick={generateInvoices}
                disabled={selectedAppointments.size === 0 || generating || !selectedSeriesId || loadingInvoiceSeries}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {generating ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generar Facturas ({selectedAppointments.size})
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Service Selection Dialog */}
      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Seleccionar Servicio</DialogTitle>
            <DialogDescription>Elige un servicio para añadir a la factura</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              {availableServices.length > 0 ? (
                availableServices.map((service) => (
                  <div
                    key={service.id}
                    className="flex justify-between items-center p-3 border rounded-md hover:bg-muted cursor-pointer"
                    onClick={() => selectServiceForForm(service)}
                  >
                    <div>
                      <h4 className="font-medium">{service.name}</h4>
                      {service.description && <p className="text-sm text-muted-foreground">{service.description}</p>}
                      <p className="text-sm text-muted-foreground">
                        IVA: {service.vat_rate}% | IRPF: {service.irpf_rate}% | Retención: {service.retention_rate}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(service.price)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">No hay servicios disponibles</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setServiceDialogOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
