"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import {
  FileText,
  X,
  CheckCircle,
  Users,
  Euro,
  Clock,
  AlertTriangle,
  Download,
  Zap,
  Package,
  Calendar,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/app/contexts/auth-context"
import JSZip from "jszip"
import type { GroupActivity } from "@/app/contexts/group-activities-context"

interface GroupActivityBillingModalProps {
  isOpen: boolean
  onClose: () => void
  activity: GroupActivity
  service: any
  organizationId: number
  onBillingComplete?: () => void
}

interface ParticipantBillingData {
  participant_id: string
  client_id: number
  client_name: string
  client_tax_id: string | null
  client_address: string | null
  client_postal_code: string | null
  client_city: string | null
  client_province: string | null
  client_email: string | null
  client_phone: string | null
  status: string
  has_complete_data: boolean
  missing_fields: string[]
  payment_method: "tarjeta" | "efectivo" | "transferencia" | "paypal" | "bizum" | "otro"
  payment_method_other: string
  // ✅ NUEVOS CAMPOS PARA ESTADO DE FACTURACIÓN
  invoice_status: "none" | "draft" | "issued" | "verified"
  invoice_info?: {
    invoice_id: string
    invoice_number: string | null
    created_at: string
    total_amount: number
  }
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

export function GroupActivityBillingModal({
  isOpen,
  onClose,
  activity,
  service,
  organizationId,
  onBillingComplete,
}: GroupActivityBillingModalProps) {
  const { userProfile } = useAuth()
  const { toast } = useToast()
  const [participantsData, setParticipantsData] = useState<ParticipantBillingData[]>([])
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [progress, setProgress] = useState<BillingProgress | null>(null)
  const [generatedInvoices, setGeneratedInvoices] = useState<GeneratedInvoice[]>([])
  const [draftInvoices, setDraftInvoices] = useState<DraftInvoice[]>([])

  // useEffect para añadir nota automática cuando IVA = 0
  useEffect(() => {
    const notaIVAExenta =
      "Operación exenta de IVA conforme al artículo 20. Uno. 3º de la Ley 37/1992 del Impuesto sobre el Valor Añadido, por tratarse de un servicio de asistencia sanitaria prestado por profesional titulado"

    // Verificar si el servicio tiene IVA = 0
    if (service && (service.vat_rate ?? 0) === 0 && service.price > 0) {
      console.log(`Actividad grupal "${activity.name}" tendrá nota de IVA exento`)
    }
  }, [service, activity])

  // Cargar y procesar datos de participantes
  useEffect(() => {
    if (isOpen) {
      loadParticipantsData()
    }
  }, [isOpen])

  const loadParticipantsData = async () => {
    setLoading(true)
    try {
      // Obtener participantes válidos (attended + registered)
      const validParticipants =
        activity.participants?.filter((p) => p.status === "attended" || p.status === "registered") || []

      const participantsWithData: ParticipantBillingData[] = validParticipants.map((participant) => {
        const client = participant.client

        // ✅ VALIDACIÓN MODIFICADA - SOLO NOMBRE (CON APELLIDOS) Y TAX_ID
        const missingFields: string[] = []

        // Verificar nombre (debe tener al menos 2 palabras para incluir apellidos)
        if (!client?.name?.trim()) {
          missingFields.push("Nombre")
        } else {
          const nameParts = client.name.trim().split(/\s+/)
          if (nameParts.length < 2) {
            missingFields.push("Apellidos (el nombre debe incluir nombre y apellidos)")
          }
        }

        // Verificar tax_id (CIF/NIF)
        if (!(client as any)?.tax_id?.trim()) {
          missingFields.push("CIF/NIF")
        }

        const hasCompleteData = missingFields.length === 0

        return {
          participant_id: participant.id,
          client_id: client?.id || 0,
          client_name: client?.name || "Sin nombre",
          client_tax_id: (client as any)?.tax_id || null,
          client_address: (client as any)?.address || null,
          client_postal_code: (client as any)?.postal_code || null,
          client_city: (client as any)?.city || null,
          client_province: (client as any)?.province || null,
          client_email: (client as any)?.email || null,
          client_phone: (client as any)?.phone || null,
          status: participant.status,
          has_complete_data: hasCompleteData,
          missing_fields: missingFields,
          payment_method: "tarjeta",
          payment_method_other: "",
          // ✅ INICIALIZAR ESTADO DE FACTURACIÓN
          invoice_status: "none",
        }
      })

      setParticipantsData(participantsWithData)

      // ✅ VERIFICAR FACTURAS EXISTENTES CON LA NUEVA LÓGICA
      await checkInvoiceStatusFromDatabase(participantsWithData)
    } catch (error) {
      console.error("Error loading participants data:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los datos de los participantes",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // ✅ NUEVA FUNCIÓN: VERIFICAR ESTADO DE FACTURAS DIRECTAMENTE EN LA BASE DE DATOS
  const checkInvoiceStatusFromDatabase = async (participantsArray: ParticipantBillingData[]) => {
    if (!userProfile?.organization_id) return

    try {
      const drafts: DraftInvoice[] = []

      // Para cada participante, verificar si existe factura
      for (const participant of participantsArray) {
        const { data: invoiceData, error } = await supabase
          .from("invoices")
          .select("id, invoice_number, status, total_amount, created_at, verifactu_sent_at")
          .eq("organization_id", userProfile.organization_id)
          .eq("group_activity_id", activity.id)
          .eq("client_id", participant.client_id)
          .limit(1)

        if (error) {
          console.error("Error checking invoice:", error)
          continue
        }

        if (invoiceData && invoiceData.length > 0) {
          const invoice = invoiceData[0]

          // ✅ DETERMINAR EL ESTADO DE LA FACTURA IGUAL QUE EN DAILY-BILLING
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

          // Actualizar el participante con la información de la factura
          participant.invoice_status = invoiceStatus
          participant.invoice_info = {
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
                client_id: participant.client_id,
                client_name: participant.client_name,
                total_amount: invoice.total_amount,
                created_at: invoice.created_at,
              })
            }
          }
        } else {
          participant.invoice_status = "none"
        }
      }

      // Actualizar estado
      setParticipantsData([...participantsArray])
      setDraftInvoices(drafts)

      // ✅ SELECCIONAR AUTOMÁTICAMENTE SOLO PARTICIPANTES VÁLIDOS SIN FACTURA
      const participantsToSelect = participantsArray
        .filter((participant) => participant.has_complete_data && participant.invoice_status === "none")
        .map((participant) => participant.participant_id)

      console.log("Auto-seleccionando participantes sin facturar:", participantsToSelect.length)
      setSelectedParticipants(new Set(participantsToSelect))
    } catch (error) {
      console.error("Error checking invoice status from database:", error)
    }
  }

  const handleParticipantToggle = (participantId: string, checked: boolean) => {
    const participant = participantsData.find((p) => p.participant_id === participantId)

    // ✅ VERIFICACIÓN SIMPLE: ¿Tiene factura?
    if (participant && participant.invoice_status !== "none") {
      return // No permitir si ya tiene factura
    }

    const newSelected = new Set(selectedParticipants)
    if (checked) {
      newSelected.add(participantId)
    } else {
      newSelected.delete(participantId)
    }
    setSelectedParticipants(newSelected)
  }

  const handleSelectAll = () => {
    const validParticipantIds = participantsData
      .filter((p) => p.has_complete_data && p.invoice_status === "none")
      .map((p) => p.participant_id)
    setSelectedParticipants(new Set(validParticipantIds))
  }

  const handleDeselectAll = () => {
    setSelectedParticipants(new Set())
  }

  const updatePaymentMethod = (
    participantId: string,
    paymentMethod: "tarjeta" | "efectivo" | "transferencia" | "paypal" | "bizum" | "otro",
    paymentMethodOther?: string,
  ) => {
    setParticipantsData((prev) =>
      prev.map((participant) =>
        participant.participant_id === participantId
          ? {
              ...participant,
              payment_method: paymentMethod,
              payment_method_other: paymentMethodOther || "",
            }
          : participant,
      ),
    )
  }

  const getPaymentMethodText = (participant: ParticipantBillingData) => {
    switch (participant.payment_method) {
      case "tarjeta":
        return "Tarjeta"
      case "efectivo":
        return "Efectivo"
      case "transferencia":
        return "Transferencia"
      case "paypal":
        return "PayPal"
      case "bizum":
        return "Bizum"
      case "otro":
        return `Otro: ${participant.payment_method_other || "No especificado"}`
      default:
        return "No especificado"
    }
  }

  // ✅ CREAR BORRADORES DE FACTURAS (SOLO PARA PARTICIPANTES SIN FACTURA)
  const generateDraftInvoices = async () => {
    if (selectedParticipants.size === 0) return

    setGenerating(true)
    const selectedParticipantsArray = Array.from(selectedParticipants)

    setProgress({
      phase: "validating",
      current: 0,
      total: selectedParticipantsArray.length,
      message: "🔍 Validando datos de participantes y preparando el proceso...",
      errors: [],
    })

    try {
      // Obtener datos de la organización
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .single()

      if (orgError || !orgData) {
        throw new Error("No se pudieron obtener los datos de la organización")
      }

      // Fase de generación de borradores
      setProgress((prev) => ({
        ...prev!,
        phase: "generating_drafts",
        message: "📄 Creando borradores de facturas para actividad grupal...",
      }))

      const errors: string[] = []
      let successCount = 0

      for (let i = 0; i < selectedParticipantsArray.length; i++) {
        const participantId = selectedParticipantsArray[i]
        const participantData = participantsData.find((p) => p.participant_id === participantId)!

        // ✅ VERIFICAR QUE NO TENGA FACTURA
        if (participantData.invoice_status !== "none") {
          errors.push(`${participantData.client_name}: Ya tiene factura`)
          continue
        }

        setProgress((prev) => ({
          ...prev!,
          current: i + 1,
          message: `📄 Creando borrador ${i + 1} de ${selectedParticipantsArray.length}`,
          currentClient: participantData.client_name,
        }))

        try {
          const serviceVatRate = service.vat_rate ?? 0
          const serviceIrpfRate = service.irpf_rate ?? 0
          const serviceRetentionRate = service.retention_rate ?? 0

          // Calcular totales
          const subtotalAmount = service.price
          const totalDiscountAmount = 0
          const baseAmount = subtotalAmount - totalDiscountAmount
          const vatAmount = (baseAmount * serviceVatRate) / 100
          const irpfAmount = (baseAmount * serviceIrpfRate) / 100
          const retentionAmount = (baseAmount * serviceRetentionRate) / 100
          const totalAmount = baseAmount + vatAmount - irpfAmount - retentionAmount

          // ✅ PREPARAR NOTAS DE LA FACTURA - INFORMACIÓN SIMPLIFICADA
          const clientInfoText = `Cliente: ${participantData.client_name}, CIF/NIF: ${participantData.client_tax_id}`
          const additionalNotes = `Factura generada para actividad grupal "${activity.name}" del ${format(
            new Date(activity.date),
            "dd/MM/yyyy",
            { locale: es },
          )}\nServicio: ${service.name} - ${service.price}€\nEstado del participante: ${
            participantData.status === "attended" ? "Asistió" : "Registrado"
          }\nMétodo de pago: ${getPaymentMethodText(participantData)}`

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
              organization_id: organizationId,
              invoice_number: null, // ✅ Sin número en borrador
              client_id: participantData.client_id,
              group_activity_id: activity.id,
              issue_date: format(new Date(), "yyyy-MM-dd"), // ✅ FECHA ACTUAL
              invoice_type: "normal",
              status: "draft", // ✅ Estado borrador
              base_amount: baseAmount,
              vat_amount: vatAmount,
              irpf_amount: irpfAmount,
              retention_amount: retentionAmount,
              total_amount: totalAmount,
              discount_amount: totalDiscountAmount,
              notes: fullNotes,
              payment_method: participantData.payment_method,
              payment_method_other: participantData.payment_method_other || null,
              created_by: userProfile!.id,
            })
            .select()
            .single()

          if (invoiceError) throw invoiceError

          // Preparar línea de factura para la actividad grupal
          const invoiceLines = [
            {
              invoice_id: invoiceData.id,
              description: `Actividad Grupal: ${activity.name} - ${format(new Date(activity.date), "dd/MM/yyyy", {
                locale: es,
              })} (${activity.start_time}-${activity.end_time}) - ${activity.professional?.name || "Sin profesional"}`,
              quantity: 1,
              unit_price: service.price,
              discount_percentage: 0,
              vat_rate: serviceVatRate,
              irpf_rate: serviceIrpfRate,
              retention_rate: serviceRetentionRate,
              line_amount: service.price,
              professional_id: null,
            },
          ]

          // Crear líneas de factura
          const { error: linesError } = await supabase.from("invoice_lines").insert(invoiceLines)

          if (linesError) {
            console.error("Error saving invoice lines:", linesError)
          }

          // ✅ ACTUALIZAR ESTADO LOCAL INMEDIATAMENTE
          setParticipantsData((prevParticipants) =>
            prevParticipants.map((participant) => {
              if (participant.participant_id === participantId) {
                return {
                  ...participant,
                  invoice_status: "draft" as const,
                  invoice_info: {
                    invoice_id: invoiceData.id,
                    invoice_number: null,
                    created_at: invoiceData.created_at,
                    total_amount: totalAmount,
                  },
                }
              }
              return participant
            }),
          )

          setDraftInvoices((prev) => [
            ...prev,
            {
              invoice_id: invoiceData.id,
              client_id: participantData.client_id,
              client_name: participantData.client_name,
              total_amount: totalAmount,
              created_at: invoiceData.created_at,
            },
          ])

          // Remover de seleccionados
          setSelectedParticipants((prev) => {
            const newSet = new Set(prev)
            newSet.delete(participantId)
            return newSet
          })

          successCount++
        } catch (error) {
          console.error(`Error generating draft for participant ${participantData.client_name}:`, error)
          errors.push(`${participantData.client_name}: ${error instanceof Error ? error.message : "Error desconocido"}`)
        }

        // Pequeña pausa para no saturar
        await new Promise((resolve) => setTimeout(resolve, 300))
      }

      // Completado
      setProgress({
        phase: "completed",
        current: selectedParticipantsArray.length,
        total: selectedParticipantsArray.length,
        message: `🎉 ¡Borradores creados exitosamente! ${successCount} borradores generados para la actividad "${activity.name}".`,
        errors,
      })

      if (successCount > 0) {
        toast({
          title: "✅ Borradores creados",
          description: `Se crearon ${successCount} borradores para la actividad grupal`,
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
      console.error("Error in group draft creation process:", error)
      setProgress({
        phase: "error",
        current: 0,
        total: selectedParticipantsArray.length,
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

      // Obtener datos de la organización
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
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
            organizationId,
            "normal",
          )

          // Actualizar contador en organización
          const { error: updateOrgError } = await supabase
            .from("organizations")
            .update({ last_invoice_number: newInvoiceNumber })
            .eq("id", organizationId)

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
          // try {
          //   const res = await fetch(`/api/verifactu/send-invoice?invoice_id=${draft.invoice_id}`)
          //   const data = await res.json()

          //   if (!res.ok) {
          //     throw new Error(data?.error || `Error ${res.status}: ${res.statusText}`)
          //   }

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

          const filename = `factura-${invoiceNumberFormatted}.pdf`
          const pdfBlob = await generatePdf(invoiceForPdf, fullInvoiceData.invoice_lines, filename, false)

          if (pdfBlob && pdfBlob instanceof Blob) {
            invoicesForZip.push({
              invoiceNumber: invoiceNumberFormatted,
              clientName: draft.client_name,
              amount: fullInvoiceData.total_amount,
              pdfBlob: pdfBlob,
              invoiceId: draft.invoice_id,
            })
          }

          // ✅ ACTUALIZAR ESTADO LOCAL - Changed from "verified" to "issued" since VeriFactu is disabled
          setParticipantsData((prevParticipants) =>
            prevParticipants.map((participant) => {
              if (participant.client_id === draft.client_id) {
                return {
                  ...participant,
                  invoice_status: "issued" as const, // Changed from "verified" to "issued" - VeriFactu disabled
                  invoice_info: {
                    invoice_id: draft.invoice_id,
                    invoice_number: invoiceNumberFormatted,
                    created_at: draft.created_at,
                    total_amount: draft.total_amount,
                  },
                }
              }
              return participant
            }),
          )

          successCount++
          // } catch (verifactuError) {
          //   console.error("Error en VeriFactu, haciendo rollback...")

          //   // Rollback completo
          //   await supabase
          //     .from("invoices")
          //     .update({
          //       status: "draft",
          //       invoice_number: null,
          //       validated_at: null,
          //     })
          //     .eq("id", draft.invoice_id)

          //   await supabase
          //     .from("organizations")
          //     .update({ last_invoice_number: newInvoiceNumber - 1 })
          //     .eq("id", organizationId)

          //   throw new Error("Error al enviar a VeriFactu. Se ha revertido la emisión.")
          // }
        } catch (error) {
          console.error(`Error issuing invoice for participant ${draft.client_name}:`, error)
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

      // Limpiar lista de borradores
      setDraftInvoices([])

      // Completado
      setProgress({
        phase: "completed",
        current: draftInvoices.length,
        total: draftInvoices.length,
        message: `🎉 ¡Facturas emitidas exitosamente! ${successCount} facturas emitidas para la actividad "${activity.name}". Usa el botón "Descargar ZIP" para obtener el archivo. (VeriFactu temporalmente desactivado)`, // Added note about VeriFactu being disabled
        errors,
      })

      if (successCount > 0) {
        toast({
          title: "🎉 Facturas emitidas",
          description: `Se emitieron ${successCount} facturas para la actividad grupal. VeriFactu temporalmente desactivado. Usa el botón para descargar el ZIP`, // Added note about VeriFactu being disabled
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
      console.error("Error in group invoice issuing process:", error)
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
          .replace(/\s+/g, "_")
          .substring(0, 30)
        const fileName = `${invoice.invoiceNumber}_${cleanClientName}.pdf`
        zip.file(fileName, invoice.pdfBlob)
      })

      const zipBlob = await zip.generateAsync({ type: "blob" })
      const dateStr = format(new Date(activity.date), "yyyy-MM-dd")
      const zipFileName = `facturas_actividad_${activity.name.replace(
        /[^a-zA-Z0-9]/g,
        "_",
      )}_${dateStr}_${generatedInvoices.length}_facturas.zip`

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
        description: `Se descargó el archivo con ${generatedInvoices.length} facturas de la actividad`,
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

  // ✅ CALCULAR TOTAL SOLO DE PARTICIPANTES SIN FACTURAR
  const getTotalSelected = () => {
    return selectedParticipants.size * service.price
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "attended":
        return <Badge className="bg-green-100 text-green-800">Asistió</Badge>
      case "registered":
        return <Badge className="bg-blue-100 text-blue-800">Registrado</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // ✅ FUNCIÓN PARA OBTENER BADGE DE ESTADO DE FACTURACIÓN
  const getInvoiceStatusBadge = (participant: ParticipantBillingData) => {
    switch (participant.invoice_status) {
      case "draft":
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800">
            <FileText className="h-3 w-3 mr-1" />
            Borrador
          </Badge>
        )
      case "issued":
        return (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Emitida #{participant.invoice_info?.invoice_number}
          </Badge>
        )
      case "verified":
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Verificada #{participant.invoice_info?.invoice_number}
          </Badge>
        )
      case "none":
      default:
        return participant.has_complete_data ? (
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Datos completos
          </Badge>
        ) : (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Datos incompletos
          </Badge>
        )
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-[95vw] h-[95vh] flex flex-col">
        {/* Header fijo */}
        <div className="bg-purple-50 px-6 py-4 border-b border-purple-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Facturación de Actividad Grupal</h2>
                <p className="text-sm text-gray-600">
                  {activity.name} - {format(new Date(activity.date), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
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

        {/* Contenido con scroll */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Clock className="h-8 w-8 text-gray-400 mx-auto mb-2 animate-spin" />
                <p className="text-gray-600">Cargando datos de participantes...</p>
              </div>
            </div>
          ) : participantsData.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay participantes</h3>
              <p className="text-gray-600">No se encontraron participantes válidos para facturar.</p>
            </div>
          ) : (
            <>
              {/* Barra de progreso */}
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
                      <Users className="h-4 w-4 text-purple-600" />
                      <div>
                        <p className="text-sm text-gray-600">Total Participantes</p>
                        <p className="text-lg font-semibold">{participantsData.length}</p>
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
                        <p className="text-lg font-semibold">{selectedParticipants.size}</p>
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
                      <FileText className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="text-sm text-gray-600">Precio por Factura</p>
                        <p className="text-lg font-semibold">{formatCurrency(service.price)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Activity Info */}
              <Card className="mb-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Información de la Actividad
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Servicio:</span>
                      <p>{service.name}</p>
                    </div>
                    <div>
                      <span className="font-medium">Precio:</span>
                      <p>{formatCurrency(service.price)}</p>
                    </div>
                    <div>
                      <span className="font-medium">Horario:</span>
                      <p>
                        {activity.start_time} - {activity.end_time}
                      </p>
                    </div>
                    <div>
                      <span className="font-medium">Profesional:</span>
                      <p>{activity.professional?.name || "Sin asignar"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Controls */}
              <div className="flex gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={handleSelectAll} disabled={generating || issuing}>
                  Seleccionar Válidos (
                  {participantsData.filter((p) => p.has_complete_data && p.invoice_status === "none").length})
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeselectAll} disabled={generating || issuing}>
                  Deseleccionar Todos
                </Button>
              </div>

              {/* Lista de participantes */}
              <div className="space-y-3">
                {participantsData.map((participant) => {
                  // ✅ DETERMINAR COLOR DE FONDO SEGÚN ESTADO
                  const getParticipantCardStyle = () => {
                    switch (participant.invoice_status) {
                      case "draft":
                        return "border-amber-200 bg-amber-50"
                      case "issued":
                        return "border-blue-200 bg-blue-50 opacity-75"
                      case "verified":
                        return "border-green-200 bg-green-50 opacity-75"
                      case "none":
                        if (!participant.has_complete_data) {
                          return "border-red-200 bg-red-50"
                        } else if (selectedParticipants.has(participant.participant_id)) {
                          return "border-purple-200 bg-purple-50"
                        }
                        return ""
                      default:
                        return ""
                    }
                  }

                  return (
                    <Card key={participant.participant_id} className={getParticipantCardStyle()}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedParticipants.has(participant.participant_id)}
                            onCheckedChange={(checked) =>
                              handleParticipantToggle(participant.participant_id, checked as boolean)
                            }
                            disabled={
                              !participant.has_complete_data ||
                              generating ||
                              issuing ||
                              participant.invoice_status !== "none"
                            }
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-medium text-gray-900">{participant.client_name}</h3>
                              {getStatusBadge(participant.status)}
                              {getInvoiceStatusBadge(participant)}
                            </div>

                            {/* ✅ MOSTRAR INFORMACIÓN DE FACTURACIÓN DETALLADA */}
                            {participant.invoice_status !== "none" && (
                              <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                                <div className="flex items-center gap-1 mb-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  <strong>Estado de facturación:</strong>
                                </div>
                                <div className="space-y-1">
                                  {participant.invoice_status === "draft" && <p>• Borrador creado</p>}
                                  {participant.invoice_status === "issued" && (
                                    <p>• Factura emitida #{participant.invoice_info?.invoice_number}</p>
                                  )}
                                  {participant.invoice_status === "verified" && (
                                    <p>• Factura verificada en VeriFactu #{participant.invoice_info?.invoice_number}</p>
                                  )}
                                  {participant.invoice_info && (
                                    <p>• Total: {formatCurrency(participant.invoice_info.total_amount)}</p>
                                  )}
                                </div>
                              </div>
                            )}

                            {!participant.has_complete_data && (
                              <div className="mb-3 p-2 bg-red-100 rounded text-sm text-red-800">
                                <strong>Faltan datos:</strong> {participant.missing_fields.join(", ")}
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                              <div>
                                <p>
                                  <strong>CIF/NIF:</strong> {participant.client_tax_id || "No especificado"}
                                </p>
                                <p>
                                  <strong>Email:</strong> {participant.client_email || "No especificado"}
                                </p>
                              </div>
                              <div>
                                <p>
                                  <strong>Teléfono:</strong> {participant.client_phone || "No especificado"}
                                </p>
                                <p>
                                  <strong>Ciudad:</strong> {participant.client_city || "No especificado"}
                                </p>
                              </div>
                            </div>

                            {/* Método de Pago - Solo mostrar si no tiene factura */}
                            {participant.has_complete_data && participant.invoice_status === "none" && (
                              <div className="mb-3 p-3 bg-gray-50 rounded-lg border">
                                <div className="flex items-center gap-2 mb-2">
                                  <Label className="text-sm font-medium text-gray-700">Método de Pago</Label>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <Select
                                    value={participant.payment_method}
                                    onValueChange={(
                                      value: "tarjeta" | "efectivo" | "transferencia" | "paypal" | "bizum" | "otro",
                                    ) => updatePaymentMethod(participant.participant_id, value)}
                                    disabled={generating || issuing}
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder="Seleccionar método" />
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
                                  {participant.payment_method === "otro" && (
                                    <Input
                                      placeholder="Especificar método..."
                                      value={participant.payment_method_other}
                                      onChange={(e) =>
                                        updatePaymentMethod(participant.participant_id, "otro", e.target.value)
                                      }
                                      disabled={generating || issuing}
                                      className="h-8 text-sm"
                                    />
                                  )}
                                </div>
                              </div>
                            )}

                            <div className="flex justify-between items-center">
                              <div className="text-sm text-gray-600">
                                Participante {participant.status === "attended" ? "que asistió" : "registrado"}
                              </div>
                              <div className="text-right">
                                <div
                                  className={`text-lg font-semibold ${
                                    participant.invoice_status !== "none"
                                      ? "text-gray-500 line-through"
                                      : "text-green-600"
                                  }`}
                                >
                                  {formatCurrency(service.price)}
                                </div>
                                {participant.invoice_status !== "none" && (
                                  <span className="text-xs text-gray-500 block">Ya facturado</span>
                                )}
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

        {/* Footer fijo */}
        {!loading && participantsData.length > 0 && (
          <div className="border-t bg-gray-50 px-6 py-4 flex-shrink-0">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {selectedParticipants.size} participantes seleccionados • {formatCurrency(getTotalSelected())} total
                {participantsData.filter((p) => p.invoice_status !== "none").length > 0 && (
                  <span className="block text-xs text-gray-500 mt-1">
                    {participantsData.filter((p) => p.invoice_status === "draft").length} borradores,{" "}
                    {participantsData.filter((p) => p.invoice_status === "issued").length} emitidas,{" "}
                    {participantsData.filter((p) => p.invoice_status === "verified").length} verificadas
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    // Solo permitir cerrar si no está generando ni emitiendo
                    if (!generating && !issuing) {
                      onClose()
                    }
                  }}
                  disabled={generating || issuing}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={generateDraftInvoices}
                  disabled={selectedParticipants.size === 0 || generating || issuing}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  {generating ? "Creando borradores..." : `Crear ${selectedParticipants.size} Borradores`}
                </Button>
                {progress?.phase === "completed" && generatedInvoices.length > 0 && (
                  <Button onClick={downloadZipAgain} variant="outline" className="gap-2 bg-transparent">
                    <Download className="h-4 w-4" />
                    Descargar ZIP ({generatedInvoices.length})
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
