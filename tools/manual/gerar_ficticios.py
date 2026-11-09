# Gera dados fictícios para os prints do manual: fict/backup-completo-exemplo.json e planilhas do dia.
# Rodar dentro da pasta de trabalho (cria em ./fict/). Também gera fict/exemplo-cadastro-motoristas.pdf.
import random, json, os, datetime as dt, openpyxl
os.makedirs('fict', exist_ok=True)
random.seed(7)
pn=['RAFAEL','WAGNER','CARLOS','MARCOS','JOSE','PAULO','ANDRE','LUCAS','DIEGO','FABIO','RODRIGO','EDSON','SERGIO','ROBERTO','ANTONIO','GILSON','RENATO','MARCELO','ADRIANO','LEANDRO','CLAUDIO','VALDIR','JOAO','LUIZ','EVANDRO','MAURO','NELSON','OSMAR','RICARDO','TIAGO','VITOR','ALEX','BRUNO','CICERO','DANIEL','ELIAS','FELIPE','GERSON','HUGO','IVAN']
sb=['TEIXEIRA JARDIM','ESTEVES DUARTE','MOREIRA PRADO','SALES CUNHA','FARIAS LOPES','REZENDE CAMPOS','VIANA ROCHA','BARROS NUNES','QUEIROZ MELO','TAVARES LIMA','PEIXOTO REIS','AMARAL COSTA','BRAGA FONTES','CORDEIRO PAIVA','DANTAS MOURA','FREITAS LEAL','GUEDES ROSA','LACERDA PINTO','MACEDO SILVA','NOGUEIRA BASTOS','OLIVEIRA RAMOS','PACHECO VALE','RIBEIRO ANDRADE','SIQUEIRA MOTA','TORRES LEITE','VASCONCELOS SA','XAVIER BORGES','ARAUJO MENDES','BATISTA COELHO','CARDOSO FRANCO','DIAS MACHADO','ESPINDOLA VAZ','FERRAZ MAIA','GALVAO SOUTO','HOLANDA BRITO','ISIDORO LUZ','JORDAO MATOS','LEMOS PORTO','MONTEIRO CRUZ','NASCIMENTO SA']
nomes=[f'{pn[i]} DA {sb[i]}' for i in range(40)]
placas=['%s%d%s%02d'%(random.choice('ABCDEFGHJ')+random.choice('KLMNOPQR')+random.choice('STUVWXYZ'),random.randint(1,9),random.choice('ABCDEFGHIJ'),random.randint(10,99)) for _ in range(40)]
perfil={}  # nome -> (b1,b2,b3,ch) mes
for i,n in enumerate(nomes):
    r=random.random()
    perfil[n]=[random.randint(2,20),random.randint(0,3),0,random.randint(0,12)]
# casos especiais
perfil[nomes[0]]=[41,7,0,24]   # varias advertencias
perfil[nomes[1]]=[38,2,1,5]    # inativo com penalidade
perfil[nomes[2]]=[30,6,2,22]   # suspensões -> termino acumulado
perfil[nomes[3]]=[29,4,0,17]   # alerta preventivo
perfil[nomes[4]]=[36,0,0,3]
perfil[nomes[5]]=[12,6,0,8]
def eventos(mes, last_day):
    seco=[];chuva=[]
    y,m=map(int,mes.split('-'))
    for i,n in enumerate(nomes):
        b1,b2,b3,ch=perfil[n]
        f=0.85 if mes=='2026-09' else 1.0
        def ts():
            d=random.randint(1,last_day); return dt.datetime(y,m,d,random.randint(5,21),random.randint(0,59),random.randint(0,59))
        for _ in range(random.randint(1,6)): seco.append((ts(),placas[i],n,random.randint(87,89),random.randint(10,90)))
        for _ in range(int(b1*f)): seco.append((ts(),placas[i],n,random.randint(90,95),random.randint(10,120)))
        for _ in range(int(b2*f)): seco.append((ts(),placas[i],n,random.randint(96,99),random.randint(10,60)))
        for _ in range(b3): seco.append((ts(),placas[i],n,random.randint(100,104),random.randint(5,40)))
        for _ in range(int(ch*f)): chuva.append((ts(),placas[i],n,random.randint(71,80),random.randint(61,240)))
        for _ in range(random.randint(0,8)): chuva.append((ts(),placas[i],n,random.randint(71,78),random.randint(5,59)))
    return sorted(seco),sorted(chuva)
def xlsx(path, evs, tipo):
    wb=openpyxl.Workbook(); ws=wb.active; ws.title='Infrações de Velocidade'
    ws.append(['Infrações de Velocidade']); ws.append([])
    ws.append(['Data','Veículo','Motorista','Duração','Velocidade','Tipo Evento','Limite'])
    for t,p,n,v,d in evs:
        ws.append([t.strftime('%d/%m/%Y %H:%M:%S'),p,n,'%02d:%02d'%(d//60,d%60),v,'Excesso de velocidade - '+('Chuva' if tipo=='chuva' else 'Seco'),80 if tipo=='chuva' else 90])
    wb.save(path)
def doc(mes,tipo,evs):
    ns=[];ix={};ev=[]
    for t,p,n,v,d in evs:
        if n not in ix: ix[n]=len(ns); ns.append(n)
        ev.append([ix[n],t.strftime('%Y-%m-%d %H:%M:%S'),p,v,d])
    return {'mes':mes,'tipo':tipo,'arquivo':f'infracoes-{tipo}-{mes}.xlsx','importadoEm':f'{mes}-28T18:00:00.000Z','motoristas':ns,'ev':ev}
meses={}
s9,c9=eventos('2026-09',30); meses['2026-09_seco']=doc('2026-09','seco',s9); meses['2026-09_chuva']=doc('2026-09','chuva',c9)
s10,c10=eventos('2026-10',30)
# 31/10 fica para a importação do dia (com alguns repetidos)
dia=[e for e in s10 if e[0].day>=30]+[e for e in c10 if e[0].day>=30]
s10b=[e for e in s10 if e[0].day<30]; c10b=[e for e in c10 if e[0].day<30]
meses['2026-10_seco']=doc('2026-10','seco',s10b+[e for e in s10 if e[0].day==30][:3]); meses['2026-10_chuva']=doc('2026-10','chuva',c10b)
xlsx('fict/exemplo-dia-seco.xlsx',[e for e in s10 if e[0].day>=30],'seco')
xlsx('fict/exemplo-dia-chuva.xlsx',[e for e in c10 if e[0].day>=30],'chuva')
mot={}
for i,n in enumerate(nomes):
    cod=1040+i*7
    cel='' if i in (9,17) else '(013) 9%04d-%04d'%(random.randint(6000,9999),random.randint(0,9999))
    if i==22: cel='(013) 3361-4410'
    from_ = cel
    d=''.join(c for c in cel if c.isdigit()).lstrip('0')
    ok = len(d)==11 and d[2]=='9'
    mot['c%d'%cod]={'codigo':str(cod),'nome':n,'celular':'55'+d if ok else '','celularOriginal':cel,'situacao':'Inativo' if i==1 else 'Ativo','atualizadoEm':'2026-10-01T12:00:00.000Z','atualizadoPor':None,'origem':'pdf'}
bk={'formato':'infracoes-velocidade-completo','versao':1,'geradoEm':'2026-10-30T18:00:00.000Z','meses':meses,'motoristas':mot,'comunicados':{},'config':{'rh':{'para':'rh@exemplo.com.br','cc':'frota@exemplo.com.br','atualizadoEm':'2026-10-01T12:00:00.000Z'}}}
json.dump(bk,open('fict/backup-completo-exemplo.json','w'))
print({k:len(v['ev']) for k,v in meses.items()}, len(dia))

# PDF "Cadastro de Motoristas - Detalhado" fictício: os 3 últimos ficam só no PDF (aparecem como Novo)
# e um celular muda (aparece como Atualiza)
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
itens = [dict(v) for v in mot.values()]
for k in list(mot.keys())[-3:]: del mot[k]
itens[6]['celularOriginal'] = '(013) 99812-3301'
json.dump(bk, open('fict/backup-completo-exemplo.json', 'w'))
c = canvas.Canvas('fict/exemplo-cadastro-motoristas.pdf', pagesize=A4)
for it in itens:
    c.setFont('Helvetica-Bold', 13); c.drawString(40, 800, 'Cadastro de Motoristas - Detalhado')
    y = 760
    for rot, val in [('Código:', it['codigo']), ('Nome do Motorista:', it['nome']), ('Celular:', it['celularOriginal']), ('Situação:', it['situacao'])]:
        c.setFont('Helvetica-Bold', 10); c.drawString(40, y, rot)
        if val: c.setFont('Helvetica', 10); c.drawString(170, y, val)
        y -= 18
    c.showPage()
c.save()
