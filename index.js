/*!
 * index.js
 */
require(["jquery","app/ajax/xhrConfig","persdoc/app/ajax/FolderService","persdoc/app/ajax/DocumentService","persdoc/app/ajax/RecycleService","persdoc/app/ajax/InodeService","persdoc/app/ajax/ShareService","persdoc/app/ajax/PersonService",
		"bim/utils/NumberFormat","bim/utils/DateFormat","bim/utils/PathUtils","sparkmd5","app/mimeUtils",
		"jq/pnotify","jq/ariaTree","jq/ariaGrid","jq/ariaBreadcrumb","jq/ariaDAVExplorer","jq/misc-plugins","jq/async-dialogs","bim/shims/html5-template","dojo/domReady!"
],function($,xhrConfig,FolderService,DocumentService,RecycleService,InodeService,ShareService,PersonService,
		NumberFormat,DateFormat,PathUtils,SparkMD5,mimeUtils){
	"use strict";
	var homeFolder=null;
	var currentFolder=null;
	var selectedRouteArray=[];
	var bravaConfig=xhrConfig.bravaConfig;
	var baseSharingLink=document.head.querySelector('meta[name="baseSharingLink"]').content;
	var qsFIRSTROWGROUP='tbody[role="rowgroup"]:first-of-type';
	var qsROW='[role="row"]';
	var qsNOTBUSY=':not([aria-busy="true"])';
	var folderService=new FolderService();
	var documentService=new DocumentService();
	var recycleService=new RecycleService();
	var inodeService=new InodeService();
	var shareService=new ShareService();
	var personService=new PersonService();
	var baselink=$('meta[name="baseSharingLink"]').prop("content");
	var specialSymbol=new RegExp("[\\\\/:*?<>|\"]");
	var Transfer={
		PERSONAL_PERSONAL:1,
		PERSONAL_PROJECT:2,
		PROJECT_PERSONAL:3,
		PROJECT_PROJECT:4
	};
	var normalizePath=function(path){
		if(path==null)
			return "";
		var prefix="System Root\\"+xhrConfig.user["Name"];
		if(path.indexOf(prefix)==0){
			path=path.substring(prefix.length).replace(/\\/g,"/");
		}else{
			path=path.replace(/\\/g,"/");
			if(path.charAt(0)!="/")
				path="/"+path;
		}
		return path;
	};
	var toHighlightHTML=function(input,regex){
		var output="";
		var start=0;
		input.replace(regex,function(found,index){
			output+=escapeHTML(input.substring(start,index));
			output+='<span class="highlight">'+escapeHTML(found)+'</span>';
			start=index+found.length;
			return "";
		});
		if(start<input.length)
			output+=escapeHTML(input.substring(start));
		return output;
	};
	var escapeHTML=function(s){
		return String(s).replace(/[&<>"']/g, function(c){
			switch(c){
			case '"':return "&quot;";
			case '&':return "&amp;";
			case "'":return "&apos;";
			case '<':return "&lt;";
			case '>':return "&gt;";
			}
		});
	};
	var escapeRegExp=function(s){
		return String(s).replace(/([{\\\[\]()*?+^$])/g, function(ch){return "\\"+ch;});
	};
	var getExtension=function(filename){
		var pos=filename.lastIndexOf(".");
		return pos==-1?"":filename.substring(pos+1);
	};
	var getNewVer=function(ver){
		if(!ver)
			return "1.0";
		var suffix=ver.match(/(?:\d*)$/)[0];
		var prefix=ver.substring(0,ver.length-suffix.length);
		return prefix+(+suffix+1);
	};
	var stripHash=function(url){
		var pos=url.indexOf("#");
		return url==-1?url:url.substring(0,pos);
	};
	var MathSign=function(n){
		return n<0?-1:n>0?1:0;
	};
	var filterFolders=function(data){
		return data.filter(function(f){
			if(f.Type=="Folder"&&f.Attributes&2)
				return false;
			return true;
		});
	};
	var openFile=function(data,acl){
		var suffix=getExtension(data.Name).toLowerCase();
		var mimeType=mimeUtils.mimeRegistry[suffix];
		if(!mimeType)
			return $.alertAsync("不支持打开此类文件");
		var url = xhrConfig.resolvePath("v1s/documents/file/download/"+data.Id)+
				"?cn="+xhrConfig.user.SpecCode;
		var user=xhrConfig.user;
		var params={
			u: user.Code + "-" + user.Name, //user
			f: data.Revision+"-"+data.Name, // file name/path
			d: url, //file url
			i: xhrConfig.appCodeName + "-" + data.Id
		};
		if(acl)
			params.c=acl;
		var href;
		switch(suffix){
		case "ifc":
			href=xhrConfig.bwviewConfig.viewerURI+"?"+$.param(params);
			window.open(href,"_bwview_"+data["Id"]);
			break;
		default:
			href=bravaConfig.viewerURI+"?"+$.param(params);
			var dpi=screen.logicalXDPI||96;
			var w=21/2.54*dpi;
			var h=Math.max(screen.availHeight-100,29.7/2.54*dpi);
			window.open(href,"_brava_"+data["Id"],"width="+w+",height="+h);
			break;
		}
	};
	
	/*$("#dlgUploadFile").draggable({
		handle: ".modal-header"
	});*/
	var openUploadList=function(){
		$("#btnUploadList").parent(":not(.open)").children(".dropdown-menu").dropdown("toggle");
	};
	$('input[data-bv-notempty="true"],input[required]').closest(".form-group").each(function(index,div){
		$(div).append('<div class="col-md-1 radio asterisk"></div>');
	});
	var paths=["/home","/sent","/received","/trash"];
	var window_hashchangeHandler=function(e){
		var hash=location.hash;
		var path=hash.substring(2);
		switch(path){
		case "/home":
			homeTreeApi.toggleItemById(homeFolder.Id,true);
			if(!$("#homeToolbar").hasClass("frm-search")){
				$("#homeToolbar>.form-container").append($("#frmSearch"));
			}
			break;
		case "/sent":
			sentFileGridApi.load(sentFileGridApi.jqGrid.children(qsFIRSTROWGROUP));
			break;
		case "/received":
			receiveFileGridApi.load(receiveFileGridApi.jqGrid.children(qsFIRSTROWGROUP));
			break;
		case "/trash":
			trashFileGridApi.loadRoot();
			break;
		default:
			location.hash="#!/home";
			return;
		}
		var target=$('.main-tablist a[href$="'+hash+'"]');
		if(target.length)
			target[0].click();
		if(path!="/home"){
			homeTreeApi.selectedItem=null;
			homeTreeApi.toggleItemById(homeFolder.Id,false);
		}
	};
	//======== async dialogs ========
	$.asyncDialogsSetup({
		typicalAlertDialog: $("#tplAlertDialog").prop("content").firstChild,
		typicalConfirmDialog: $("#tplConfirmDialog").prop("content").firstChild,
		typicalPromptDialog: $("#tplPromptDialog").prop("content").firstChild,
		selectorMessage:".message",
		selectorCancel:".btn-cancel",
		selectorOK:".btn-ok",
		selectorValue:".value-input"
	});
	//======== tree ========
	var homeTree=$("#homeTree");
	homeTree.on("selecteditem",function(e){
		var treeitem=e.detail;
		var data=treeitem.prop("data");
		currentFolder=data;
		searchResultFileGridApi.currentFolder=data;
		homeFileGridApi.searchParams=data["Id"];
		homeFileGridApi.load(homeFileGrid.children(qsFIRSTROWGROUP));
		if($("#panelSeachResult").is(":visible")){
			$("#lnkBackHome").click();
		}
		if(treeitem.attr("aria-expanded")==null&&treeitem.attr("aria-haspopup")=="true")
			homeTreeApi.load(treeitem).then(function(){
				treeitem.attr("aria-expanded",false);
			});
		breadcrumbApi.pushState(homeTreeApi.selectedRouteArray,e.dontTrack);
		homeDAVExplorerApi.jqBackButton.prop("disabled",!breadcrumbApi.canGoBack());
		homeDAVExplorerApi.jqForwardButton.prop("disabled",!breadcrumbApi.canGoForward());
	});
	var homeTreeApi=homeTree.ariaTree({
		groupTemplate:"#tplTreelist",
		treeitemTemplate:"#tplTreeitem"
	}).data("ariaTree");
	homeTreeApi.dataFunction=function(treeitem){
		var data=treeitem.prop("data");
		return folderService.getSubFoldersById({Id:data["Id"]},this).then(function(response){
			return filterFolders(response.data);
		});
	};
	homeTreeApi.treeitemFunction=function(data,index,list,contextItem){
		var treeitem=this.typicalTreeitem.cloneNode(true);
		treeitem.querySelector(".node-label").textContent=data["Name"];
		treeitem.setAttribute("data-id",data["Id"]);
		treeitem.setAttribute("data-type","Folder");
		treeitem.setAttribute("aria-level",+contextItem.attr("aria-level")+1);
		treeitem.setAttribute("aria-haspopup",true);
		return treeitem;
	};
	$(document).on("deletedfile",function(e){
		var data=e.detail;
		if(data.Type=="Folder"){
			homeTreeApi.removeItemById(data.Id);
		}
	});
	var homeFolderPromise=folderService.getUserHomeFolders({},this).then(function(response){
		var list=response.data;
		homeFolder=list.namedItem("Home");
		homeFolder.Path=normalizePath(homeFolder.Path);
		homeFolder.localeName="我的文档";
		$("#tnodeHome").attr("data-id",homeFolder["Id"]).prop("data",homeFolder);
		var path=location.hash.substring(2);
		var index=Math.max(paths.indexOf(path),0);
		$(".main-tablist").tabs(".main-panellist>.main-tabpanel",{
			tabs: 'a[role="tab"]',
			initialIndex: index,
			current: 'active',
			wouldDefaultPrevented: false
		});
		$(".page-body").attr("aria-busy",false);
	},function(){
		$(".page-body").attr("aria-busy",false);
	});
	//======== DAVExplorer ========
	var homeDAVExplorerApi=$("#homeDAVExplorer").ariaDAVExplorer({
		
	}).data("ariaDAVExplorer");
	//======== DAVExplorer.jqBreadcrumb ========
	var breadcrumbApi=homeDAVExplorerApi.breadcrumbApi;
	homeDAVExplorerApi.jqBreadcrumb.on("selecteditem",function(e){
		var item=e.detail;
		var data=item.prop("data");
		homeTreeApi.locateItemById(data["Id"],{dontTrack:true});
	})
	homeDAVExplorerApi.jqBreadcrumb.on("back forward",function(e){
		var state=e.detail;
		var folder=state[state.length-1];
		var treeitem=homeTreeApi.findItemById(folder.Id);
		if(treeitem.length==0)
			return $.alertAsync("无法转到目标状态,对应节点可能已被删除");
		homeTreeApi.locateItemById(folder.Id,{dontTrack:true});
	});
	//======== DAVExplorer.jqFileGrid ========
	var homeFileGridApi=homeDAVExplorerApi.fileGridApi;
	var homeFileGrid=homeFileGridApi.jqGrid;
	homeFileGrid.on("loaded",function(){
		var rows=$(this).find("tbody>tr");
		rows.addEventListener("dragstart",tr_dragstartHandler);
		rows.addEventListener("dragend",tr_dragendHandler);
		var folderRows=rows.filter('[data-type="Folder"]');
		folderRows.addEventListener("dragover",tr_dragoverHandler);
		folderRows.addEventListener("dragenter",tr_dragenterHandler);
		folderRows.addEventListener("dragleave",tr_dragleaveHandler);
		folderRows.addEventListener("drop",tr_dropHandler);
	});
	homeFileGrid.on("loaded",function(){
		var checked=$("#chkShowHistoryRev").prop("checked");
		if(checked){
			$(this).find(qsFIRSTROWGROUP).find('tr[data-is-latest="true"] .row-expand').trigger("click");
		}
	});
	homeFileGrid.on("unloaded",function(e){
		$("#btnDownload,#btnShare,#btnDelete").toggleClass("disabled",false);
	});
	homeFileGrid.on("selectedrow",function(e){
		$("#btnDownload,#btnShare,#btnDelete").toggleClass("disabled",false);
	});
	homeFileGrid.on("deselectedrow",function(e){
		if(homeFileGridApi.selectedRows.length==0)
			$("#btnDownload,#btnShare,#btnDelete").toggleClass("disabled",true);
	});
	var draggingElement=null;
	/* events fired on the draggable target */
	var tr_dragstartHandler=function(e){
		$(this).addClass("dragstart");
		e.dataTransfer.setData("text/plain", this.getAttribute("data-id"));
		e.dataTransfer.effectAllowed="move";
		draggingElement=this;
	};
	var tr_dragendHandler=function(e){
		$(this).removeClass("dragstart");
	};
	/* events fired on the drop targets */
	var tr_dragoverHandler=function(e){
		e.preventDefault();
		e.dataTransfer.dropEffect="move";
	};
	var tr_dragenterHandler=function(e){
		if(this==draggingElement)
			return;
		var dataId=e.dataTransfer.getData("text/plain");
		var dragTo=$(this);
		if(dataId){
			var dragFrom=dragTo.siblings('[data-id="'+dataId+'"]');
			if(dragFrom.length==0||dragFrom[0]==this)
				return;
		}
		dragTo.addClass("dragenter");
	};
	var tr_dragleaveHandler=function(e){
		$(this).removeClass("dragenter");
	};
	var tr_dropHandler=function(e){
		e.preventDefault();
		$(this).removeClass("dragenter");
		var dataId=e.dataTransfer.getData("text/plain");
		if(!dataId)
			return;
		var dragTo=$(this),
			dragFrom=dragTo.siblings('[data-id="'+dataId+'"]');
		if(dragFrom.length==0||dragFrom[0]==this)
			return;
		var data=dragFrom.prop("data");
		var data2=dragTo.prop("data");
		console.log(data,data2);
		var formData={ToFolderId:data2.Id};
		var message="确定要移动\""+data.Name+"\"到 \""+data2.Name+"\"？";
		if(data.Type=="Folder"){
			$.confirmAsync(message).done(function(confirmd){
				if(!confirmd)return;
				formData.FolderId=data.Id;
				folderService.moveFolder(formData).then(function(response){
					homeFileGridApi.removeRowById(data.Id);
				});
			});
		}else{
			$.confirmAsync(message).done(function(confirmd){
				if(!confirmd)return;
				formData.FolderId=currentFolder.Id;
				formData.DocId=data.DocId;
				folderService.moveFile(formData).then(function(response){
					homeFileGridApi.removeRowById(data.Id);
				});
			});
		}
	};
	homeFileGridApi.dataFunction=function(rowgroup){
		return folderService.getSubInfosById({FolderId:this.searchParams},this).then(function(response){
			var data=filterFolders(response.data);
			data.forEach(function(item,index){
				if(item.Type=="Folder"){
					item["CanonicalPath"]=normalizePath(item["Path"]);
				}else{
					if(!item.Revision)
						item.Revision="1.0";
					item.CreateTimeMillis=Date.parse(item.CreateTime);
				}
				item.LastModified=typeof item.LastModifyTime=="string"?Date.parse(item.LastModifyTime):item.LastModifyTime;
			});
			var arrFolder=[];
			var arrFile=[];
			for(var i=0;i<data.length;++i){
				(data[i].Type=="Folder"?arrFolder:arrFile).push(data[i]);
			}
			arrFile.sort(function(a,b){
				return a.Name.localeCompare(b.Name)||MathSign(b.CreateTimeMillis-a.CreateTimeMillis);
			});
			data=arrFolder.concat(arrFile);
			//触发在ariaDAVExplorer.js中注册的listenReloadBusy事件，用来设置重新加载按钮状态
			$(document).trigger("listenReloadBusy",true)
			return data;
		});
	};
	homeFileGridApi.rowFunction=function(data,index,list,contextGroup){
		var row=this.typicalRow.cloneNode(true);
		var type=data["Type"];
		var name=data["Name"].toLowerCase();
		row.setAttribute("data-id",data["Id"]);
		row.setAttribute("data-type",type);
		row.setAttribute("data-name",name);
		var rowToggle=row.querySelector('[axis="Id"]>input[name="Id"]');
		rowToggle.id="chk"+contextGroup.attr("data-uuid")+data["Id"];
		rowToggle.value=data["Id"];
		var rowLabel=row.querySelector('[axis="Name"]>.row-label');
		if(data["NameHTML"]){
			rowLabel.innerHTML=data["NameHTML"];
		}else{
			rowLabel.textContent=data["Name"];
		}
		if(data["Description"])
			rowLabel.title+=(rowLabel.title?"\n":"")+"描述: "+data["Description"];
		if(data["Location"])
			row.querySelector('[axis="Location"]>.nowrap').textContent=data["Location"];
		row.querySelector('[axis="LastModified"]').textContent=DateFormat.formatLocalString(data["LastModifyTime"]);
		if(type=="Folder"){
			rowLabel.setAttribute("data-ext",".");
			row.querySelector('[axis="Type"]').textContent="文件夹";
		}else{
			var path=currentFolder.Path;
			if(path.slice(-1)!="/")
				path+="/";
			var suffix=getExtension(data.Name).toLowerCase();
			var perceivedType=mimeUtils.getPerceivedTypeBySuffix(suffix);
			rowLabel.setAttribute("data-perceived-type",perceivedType);
			rowLabel.setAttribute("data-ext",suffix);
			var iconUrl=mimeUtils.getIconBySuffix(suffix);
			if(iconUrl){
				rowLabel.style.backgroundImage='url("'+iconUrl+'")';
			}
			row.querySelector('[axis="Type"]>.nowrap').textContent=getExtension(data["Name"])||"文件";
			row.querySelector('[axis="Size"]').textContent=NumberFormat.formatShortIECBytes(data["Size"],2);
			row.querySelector('[axis="Revision"]>.rev').textContent=data["Revision"]||"\xA0";
			row.setAttribute("data-doc-code",data["DocCode"]);
			row.setAttribute("data-is-latest",data["IsLatestRevision"]);
			if(data["IsLatestRevision"]){
				if(index<list.length-1&&list[index+1].DocCode!=data.DocCode || index==list.length-1){//当前文件没有历史版本
					$(row.querySelector(".btn-showhistory")).addClass("hidden");
				}
			}else{
				rowLabel.setAttribute("data-rev",data.Revision);
				$(row.querySelectorAll(".btn-checkin,.btn-rename,.btn-showhistory")).remove();
			}
		}
		$(row.querySelectorAll('[data-type-name]:not([data-type-name~="'+type+'"])')).remove();
		return row;
	};
	homeFileGridApi.loadRoot=function(){
		this.searchParams=xhrConfig.user["RootId"];
		return this.load(this.jqGrid.children(qsFIRSTROWGROUP));
	};
	//显示/隐藏历史版本
	$("#chkShowHistoryRev").on("change",function(){
		var checked=this.checked;
		var selectorText='tbody>tr[data-is-latest="true"]'
		if(checked){
			selectorText+=':not([aria-expanded="true"])';
		}else{
			selectorText+='[aria-expanded="true"]';
		}
		var rows=homeFileGridApi.jqGrid.find(selectorText);
		rows.find(".row-expand").trigger("click");
	});
	$(document).on("deletedfile",function(e){
		var data=e.detail;
		homeFileGridApi.removeRowById(data.Id);
	});
	//显示历史版本
	homeFileGrid.on("click",".btn-showhistory",function(){
		var btn=$(this);
		var row=btn.closest("tr");
		var data=row.prop("data");
		var expanded=row.attr("aria-expanded")=="true";
		row.attr("aria-expanded",!expanded);
		row.nextAll('tr[data-doc-code="'+data.DocCode+'"][data-is-latest="false"]').css("display",expanded?"none":"table-row");
	});
	//打开文件或文件夹
	homeFileGrid.on("click",".row-label",function(e){
		e.preventDefault();
		var row=$(this).closest("tr");
		var data=row.prop("data");
		if(data["Type"]=="Folder"){
			homeTreeApi.toggleItemById(data.ParentId,true);
			homeTreeApi.locateItemById(data.Id);
			homeTreeApi.load(homeTreeApi.findItemById(currentFolder.Id));
		}else{
			openFile(data);
		}
	});
	var searchResultFileGridApi=null;
	var sentFileGridApi=null;
	var receiveFileGridApi=null;
	var detailFileGridApi=null;
	var breadcrumbDetailbApi=null;
	var detailFileGrid=null;//XXX

	homeFolderPromise.then(function(response,imports){
		onExtraLoaded();
		window.addEventListener("hashchange", window_hashchangeHandler);
		window_hashchangeHandler.call(window,{target:window,oldURL:stripHash(location.href),newURL:document.URL});
	});
	//======== trash grid ========
	var trashFileGrid=$("#trashFileGrid");
	var trashFileGridApi=trashFileGrid.ariaGrid({
		rowgroupTemplate: "#tplTrashFileGridRowgroup",
		rowTemplate: "#tplTrashFileGridRow",
		onUnloaded:function(e){
			$("#btnRealDelete,#btnRestore").prop("disabled",true);
		},
		onChange:function(e){
			$("#btnRealDelete,#btnRestore").prop("disabled",trashFileGridApi.selectedRows.length==0);
		}
	}).data("ariaGrid");
	trashFileGridApi.dataFunction=function(rowgroup){
		return recycleService.getRecycleSubInfo({},this).then(function(response){
			var data=response.data;
			data.forEach(function(item){
				if(item["Type"]=="Folder"){
					item["OrgPath"]=normalizePath(item["Path"]);
				}else{
					item["OrgPath"]=normalizePath(item["OrgPath"]);
				}
			});
			return data;
		});
	};
	trashFileGridApi.rowFunction=function(data,index,list,contextGroup){
		var gridId=this.jqGrid.attr("id");
		var row=this.typicalRow.cloneNode(true);
		var type=data["Type"];
		row.setAttribute("data-id",data["Id"]);
		row.setAttribute("data-type",type);
		var rowToggle=row.querySelector('[axis="Id"]>input[name="Id"]');
		rowToggle.id="chk"+contextGroup.attr("data-uuid")+data["Id"];
		rowToggle.value=data["Id"];
		var rowLabel=row.querySelector('[axis="Name"]>.row-label');
		if(data["NameHTML"]){
			rowLabel.innerHTML=data["NameHTML"];
		}else{
			rowLabel.textContent=data["Name"];
		}
		if(data["Description"])
			rowLabel.title=data["Description"];
		if(data["Location"])
			row.querySelector('[axis="Location"]>.nowrap').textContent=data["Location"];
		row.querySelector('[axis="OrgPath"]>.nowrap').textContent=data["OrgPath"];
		row.querySelector('[axis="DeleteDate"]').textContent=DateFormat.formatLocalString(data["DeleteDate"]);
		row.querySelector('[axis="ExpirationTime"]').textContent=DateFormat.formatLocalString(data["ExpDate"]);
		if(type=="Folder"){
			rowLabel.setAttribute("data-ext",".");
			row.querySelector('[axis="Type"]').textContent="文件夹";
		}else{
			var suffix=getExtension(data.Name).toLowerCase();
			var perceivedType=mimeUtils.getPerceivedTypeBySuffix(suffix);
			rowLabel.setAttribute("data-perceived-type",perceivedType);
			rowLabel.setAttribute("data-ext",suffix);
			var iconUrl=mimeUtils.getIconBySuffix(suffix);
			if(iconUrl){
				rowLabel.style.backgroundImage='url("'+iconUrl+'")';
			}
			row.querySelector('[axis="Type"]>.nowrap').textContent=data["Format"]||"文件";
			row.querySelector('[axis="Size"]').textContent=NumberFormat.formatShortIECBytes(data["Size"],2);
			row.querySelector('[axis="Revision"]>.rev').textContent=data["Revision"]||"\xA0";
			row.setAttribute("data-doc-code",data["DocCode"]);
		}
		return row;
	};
	trashFileGridApi.loadRoot=function(){
		return this.load(this.jqGrid.children(qsFIRSTROWGROUP));
	};
	//彻底删除
	trashFileGrid.on("click",".btn-delete",function(){
		var row=$(this).closest("tr");
		var data=row.prop("data");
		$.confirmAsync("确定要彻底删除\""+data["Name"]+"\"吗?").then(function(confirmed){
			if(!confirmed)return;
			var formData={Type:data["Type"],Id:data["Id"]};
			if(formData.Type!="Folder")
				formData.DocId=data["DocId"];
			recycleService.realDeleteSingleDOF(formData).then(function(response){
				if(response.code==0){
					$.pnotify("删除成功","","success");
					trashFileGridApi.loadRoot();
				}else{
					$.pnotify(response.message,"错误提示","error");
				}
			});
		});
	});
	//还原
	trashFileGrid.on("click",".btn-restore",function(){
		var row=$(this).closest(qsROW);
		var data=row.prop("data");
		var formData={Type:data["Type"],Id:data["Id"]};
		if(data["Type"]!="Folder")
			formData.DocId=data["DocId"];
		recycleService.restoreSingleDOF(formData).then(function(response){
			if(response.code==0){
				$.pnotify("还原成功","","success");
				trashFileGridApi.loadRoot();
				if(data["Type"]=="Folder"){
					homeTreeApi.load(homeTreeApi.findItemById(homeFolder.Id));
				}
			}else{
				$.pnotify(response.message,"错误提示","error");
			}
		});
	});
	//彻底删除(批量)
	$("#btnRealDelete").on("click",function(){
		var selectedObjects=trashFileGridApi.selectedObjects;
		if(selectedObjects.length==0)
			return;
		$.confirmAsync("确定要将选中项彻底删除?").then(function(confirmed){
			if(!confirmed)return;
			$("#btnRealDelete,#btnRestore").prop("disabled",true);
			var formData=selectedObjects.map(function(data){
				var item={Type:data["Type"],Id:data["Id"]};
				if(data["Type"]!="Folder")
					item.DocId=data["DocId"];
				return item;
			});
			recycleService.realDeleteMoreDOF(formData).then(function(response){
				if(response.code==0){
					trashFileGridApi.loadRoot();
					$.pnotify("删除成功","","success");
				}else{
					trashFileGridApi.loadRoot();
					$.pnotify(response.message,"错误提示","error");
				}
			});
		});
	});
	//还原(批量)
	$("#btnRestore").on("click",function(){
		var selectedObjects=trashFileGridApi.selectedObjects;
		if(selectedObjects.length==0)
			return;
		var formData=selectedObjects.map(function(data){
			var item={Type:data["Type"],Id:data["Id"]};
			if(data.Type!="Folder")
				item.DocId=data.DocId;
			return item;
		});
		recycleService.restoreMoreDOF(formData).then(function(response){
			if(response.code==0){
				$.pnotify("还原成功","","success");
				trashFileGridApi.loadRoot();
				homeTreeApi.load(homeTreeApi.findItemById(homeFolder.Id));
			}else{
				$.pnotify(response.message,"错误提示","error");
			}
		});
	});
	//上传任务列表下拉
	$(".dropdown-menu.stop-propagation").on("click",function(e){
		e.stopPropagation();
	}).parent().on("hide.bs.dropdown",function(e){
		var that=this;
		var then=+this.getAttribute("data-allow-toggle-until");
		var now=Date.now();
		if(then){
			if(now<then){
				e.preventDefault();
			}else{
				that.removeAttribute("data-allow-toggle-until");
			}
		}
	});
	//新建文件夹
	$("#btnNewFolder").on("click",function(){
		$("#dlgNewFolder").modal("show");
	});
	$("#dlgNewFolder").on("show.bs.modal",function(){
		$('#frmNewFolder').data('bootstrapValidator').resetForm(true);
	}).on("shown.bs.modal",function(){
		$('input[name="Name"]',this).focus();
	});
	$("#frmNewFolder").bootstrapValidator({
		fields : {
			Name: {
				validators: {
					regexp: {
							message: '名称不能包含特殊字符\\ \/ : * ? &lt; &gt; | &quot;'
						}
					}
				}
			}
		}
	).on("success.form.bv",function(e){
		e.preventDefault();
		if(!$("#frmNewFolder").data("bootstrapValidator").isValid()){
			return;
		}
		var Name = $('#folder-name').val();
		var Desc = $('#folder-desc').val();
		var folder = {
			"Operation": "new",
			"Name": Name,
			"Description": Desc,
			"ParentId": currentFolder.Id
		};
		var currFolder=currentFolder;
		folderService.createFolder(folder).then(function(response){
			if(response.code==0){
				$('#dlgNewFolder').modal("hide");
				$('#btnResetNewFolder').trigger("click");
				homeFileGridApi.searchParams=currFolder.Id;
				homeFileGridApi.load(homeFileGrid.children(qsFIRSTROWGROUP));
				homeTreeApi.load(homeTreeApi.findItemById(currFolder.Id));
			}else{
				$.pnotify(response.message,"错误提示","error");
			}
		});
	});
	var md5sum=function(file,callback,errback){
		var blobSlice = file.slice || file.mozSlice || file.webkitSlice,
			spark = new SparkMD5.ArrayBuffer(),
			fileReader = new FileReader(),
			chunkSize = 8388608,                // Read in chunks of 8MB
			chunks = Math.ceil(file.size / chunkSize),
			currentChunk = 0;
		var loadNext = function() {
			var start = currentChunk * chunkSize,
				end = Math.min(file.size, start + chunkSize);
			/*fileReader.readAsArrayBuffer(end,blobSlice.call(file, start, end));*/
			fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
		};
		fileReader.onload = function (e) {
			spark.append(e.target.result);                  // Append array buffer
			currentChunk++;
			if (currentChunk < chunks) {
				loadNext();
			} else {
				callback(spark.end());
			}
		};
		fileReader.onerror = errback;
		if(file.size<=chunkSize){
			fileReader.readAsArrayBuffer(file);
		}else{
			loadNext();
		}
	};
	var uploadGrid=$("#uploadGrid");
	var uploadGridApi=uploadGrid.ariaGrid({
		rowgroupTemplate: uploadGrid.find('template[data-role="typicalRowgroup"]')[0],
		rowTemplate: uploadGrid.find('template[data-role="typicalRow"]')[0]
	}).data("ariaGrid");
	var uploadTasks=JSON.parse(sessionStorage.getItem("uploadTasks")||"[]");
	$(window).on("beforeunload",function(){
		sessionStorage.setItem("uploadTasks",JSON.stringify(uploadTasks,
			["id","action","code","percentLoaded","loaded","xhr","file","name","size","lastModifiedDate","folder","Id","ParentId","Name","Path"]));
	});
	uploadGridApi.dataFunction=function(data){
		return uploadTasks;
	};
	uploadGridApi.rowFunction=function(data,index,list,contextGroup){
		var row=this.typicalRow.cloneNode(true);
		row.setAttribute("data-id",data["id"]);
		row.querySelector(".row-toggle").value=data["id"];
		var rowLabel=row.querySelector(".row-label");
		rowLabel.textContent=data.file.name;
		var suffix=getExtension(data.file.name).toLowerCase();
		var perceivedType=mimeUtils.getPerceivedTypeBySuffix(suffix);
		rowLabel.setAttribute("data-perceived-type",perceivedType);
		rowLabel.setAttribute("data-ext",suffix);
		var iconUrl=mimeUtils.getIconBySuffix(suffix);
		if(iconUrl){
			rowLabel.style.backgroundImage='url("'+iconUrl+'")';
		}
		var percentLoaded=data["percentLoaded"];
		if(percentLoaded==100){
			row.querySelector('[axis="Progress"]>.nowrap').textContent=data.code==0?"已完成":"上传失败";
		}else{
			row.querySelector('progress').value=data["percentLoaded"];  
		}
		row.querySelector('td[axis="Action"]').textContent=data["action"];
		row.querySelector('[axis="Size"]>.nowrap').textContent=NumberFormat.formatShortIECBytes(data.file.size,2);
		return row;
	};
	if(uploadTasks.length){
		uploadGridApi.load();
	}
	function UploadTask(file,folder,xhr,grid,action){
		var uploadId=$.nextUuid();
		this.id=uploadId;
		this.file={name:file.name,size:file.size,contentType:file.contentType,lastModifiedDate:file.lastModifiedDate};
		this.folder=folder;
		this.xhr=xhr;
		this.action=action||"";

		var loaded=0;
		Object.defineProperty(this,"loaded",{enumerable:true,configurable:true,get:function(){return loaded;}});
		Object.defineProperty(this,"percentLoaded",{enumerable:true,configurable:true,get:function(){
			return loaded/file.size*100;
		}});
		xhr.upload.addEventListener("progress",function(e){
			loaded=e.loaded;
			var percent=e.total==0?100:e.loaded/e.total*100;
			grid.find('tbody>tr[data-id="'+uploadId+'"] progress').prop("value",percent.toFixed(0));
		});
		xhr.upload.addEventListener("abort",function(e){
			grid.find('tbody>tr[data-id="'+uploadId+'"]>td[axis="Progress"]>.nowrap').text("已中断");
		});
		xhr.upload.addEventListener("load",function(e){
			loaded=file.size;
		});
	}
	
	// 上传文件 or 文件夹
	$("#btnUpload").on("click",function(){
		$("#dlgUploadFile").modal("show");
	});
	// 表格默认设置项
	function DefaultSettings(){
		throw new Error();
	}
	DefaultSettings.newInstance=function(){
		return this.instance||(this.instance=$.extend(Object.create(DefaultSettings.prototype),{
			selDefaultFileTodo: $("#selDefaultFileTodo"),
			selDefaultVersion: $("#selDefaultVersion"),
			txtDefaultVersion: $("#txtDefaultVersion"),
			txtDefaultDescription: $("#txtDefaultDescription")
		}));
	};
	DefaultSettings.prototype.getComputedVersionValue=function(input){
		var value=input.value.trim();
		if(!value)
			value=(input.getAttribute("placeholder")||"").trim();
		return value;
	};
	DefaultSettings.prototype.getComputedTodoValue=function(select){
		var value=select.value;
		if(value==="inherit")
			value=this.selDefaultFileTodo.prop("value");
		return value;
	};
	DefaultSettings.prototype.getComputedDescriptionValue=function(input){
		var value=input.value;
		if(!value) 
			value=this.txtDefaultDescription.prop("value");
		return value;
	};
	DefaultSettings.prototype.reset=function(){
		this.selDefaultFileTodo.prop("value","upgrade").trigger("change");
		this.selDefaultVersion.prop("value","auto").trigger("change");
		this.txtDefaultVersion.prop("value","").trigger("change");
		this.txtDefaultDescription.prop("value","");
	};
	var defaults=DefaultSettings.newInstance();
	// 监听选项关联
	$("#selDefaultFileTodo").on("change",function(){
		var defaultValue=this.value;
		var text=$("option:selected",this).prop("text");
		uploadListGrid.find('tr[data-type="Doc"] select[name="todo"]').each(function(index,select){
			select.setAttribute("data-value",this.value);
			if(this.value==="inherit"){
				$(select).triggerHandler("change");
			}
		}).children('option[value="inherit"]').attr("label",text+"(默认)");
	}).triggerHandler("change");
	$("#txtDefaultVersion").prop("value","1.0").on("input",function(){
		uploadListGrid.find('input[name="version"]').prop("placeholder",this.value);
	}).trigger("input");
	$("#txtDefaultDescription").on("input",function(){
		uploadListGrid.find('input[name="description"]').prop("placeholder",this.value);
	}).trigger("input");
	$("#selDefaultVersion").on("change",function(){
		$("#txtDefaultVersion").css("visibility",this.value==="specified"?"visible":"hidden");
		if(this.value==="auto"){
			uploadListGrid.find('tr[data-type="Doc"] input[name="version"]').each(function(index,input){
				var ver=input.getAttribute("data-value");
				input.setAttribute("placeholder",getNewVer(ver));
			});
		}else if (this.value==="specified") {
			var defaultVersion=$("#txtDefaultVersion").prop("value");
			uploadListGrid.find('tr[data-type="Doc"] input[name="version"]').attr("placeholder",defaultVersion);
		}
	}).triggerHandler("change");
	$("#dlgToUpload").on("show.bs.modal",function(e){
		$("#putFiles").prop("value","");
		$("#putFolder").prop("value","");
		$("#divDroparea>span").text("拖放文件到此区域");
		$("#nextSubmitFiles").prop("disabled",true);
	}).on("hide.bs.modal",function(e){

	});
	var getClientFiles = function(files) {
		var clientFiles=[];
		Array.prototype.forEach.call(files,function(file){
			clientFiles.push({
				file: file,
				Id: $.nextUuid(),
				Name: file.name,
				Type: "Doc"
			});
		});
		return clientFiles;
	};
	var getMergedFiles=function(serverFiles,clientFiles){
		if(clientFiles.length!=serverFiles.length){
			//TODO
		}
		serverFiles.forEach(function(sFile,index){
			var cFile=clientFiles[index];
			sFile.file=cFile.file;
			sFile.Id=cFile.Id;
			if(!sFile.Name)
				sFile.Name=cFile.Name;
			sFile.Type=cFile.Type;
		});
		return serverFiles;
	};
	// 修改code就两种情况
	var Codes={LOCATION_NOT_EXISTS:1,EXISTS:2,NOT_EXISTS:3};
	var createOptions=function(type,code) {
		var text = $("#selDefaultFileTodo option:selected").prop("text");
		var opts = document.createDocumentFragment();
		if(code===Codes.LOCATION_NOT_EXISTS||code===Codes.NOT_EXISTS) {
			opts.appendChild(new Option("新建","add"));
		}else if(code===Codes.EXISTS) {
			opts.appendChild(new Option(text+"默认","inherit"));
			opts.appendChild(new Option("升级","upgrade"));
			opts.appendChild(new Option("覆盖","overwrite"));
		}
		return opts;
	};
	var clientFiles=[];
	// 选择文件
	$("#btnSelectFiles").on("click",function(){
		$("#putFiles")[0].click();
	});
	$("#putFiles").on("change",function(){
		var files=this.files;
		if(files.length===0)
			return;
		//TODO set busy
		$("#divDroparea>span").text("已选择 "+files.length+" 文件");
		$("#nextSubmitFiles").prop("disabled",false);
		clientFiles=getClientFiles(files);
		uploadListGridApi.dataFunction=function(rowgroup){
			var folderId=16;//currentFolder.Id 6270 16
			var sentFiles=clientFiles.map(function(cFile){
				return {
					Name: cFile.Name,
					Type: cFile.Type,
					webkitRelativePath: cFile.file["webkitRelativePath"]
				};
			});
			var data={
				isDirectory:false,
				folderId: folderId,//currentFolder.Id
				files: sentFiles
			};
			return folderService.uploadFileCheck(data,this).then(function(response){
				//$("#btnSubmitFiles").removeAttr("disabled");
				if(response.code===0) {
					return getMergedFiles(response.data,clientFiles);
				}
				throw new Error(response.message);
			});
		};
		uploadListGridApi.load();
	});
	// 选择文件夹
	$("#btnSelectFolder").on("click",function(){
		$("#putFolder")[0].click();
	});
	$("#putFolder").on("change",function(){
		var files=this.files;
		if(files.length===0)
			return;
		console.log("共选择%i个文件",files.length);
		console.table(files);
		var choosenFile = files[0].webkitRelativePath.split("/").shift();
		var fileInnertext = "已选择 " + choosenFile + " 文件夹";
		$("#divDroparea>span").text(fileInnertext);
		$("#nextSubmitFiles").prop("disabled",false);
		clientFiles=getClientFiles(files);
		uploadListGridApi.dataFunction();
		uploadListGridApi.load();
	});
	$("#nextSubmitFiles").on("click",function() {
		$("#dlgToUpload").modal("hide");
	});
	// frmFileUpload 待修改
	$(window).on("beforeunload",function(){
		$('#frmFileUpload')[0].reset();
	});
	$(document).on("uploadtasksprogress",function(e){
		if(e.uploading==0){
			setTimeout(function(){
				var btn=$("#btnUploadList");
				if(btn.attr("aria-expanded")=="true"){
					btn.triggerHandler("click");
				}
			},2000);
		}
	});
	// 提交文件/文件夹
	$("#btnSubmitFiles").on("click",function(){
		var MAX_SIZE=1024*1024*100;
		var tasks=[];
		var folderId=currentFolder.Id;//6270 16
		var exhibitionNum=$(".exhibitionNum");
		var promises=[];
		var uploadStat={
			rejectedMessages:[],
			successMessages:[],
			errorMessages:[],
			rejectedFiles:[],
			successFiles:[],
			errorFiles:[]
		};
		
		// 文件数据预处理
		var validClientFiles = [];
		Array.prototype.forEach.call($('#uploadListGrid tbody>[role="row"]'),function(tr){
			var cFile = tr.data;
			cFile.valid=false;
			var file=cFile.file;
			if(file.size===0){
				uploadStat.rejectedFiles.push(file);
				uploadStat.rejectedMessages.push("文件\""+file.name+"\"大小为0字节");
				return;
			}
			if(file.size>MAX_SIZE){
				uploadStat.rejectedFiles.push(file);
				uploadStat.rejectedMessages.push("文件\""+file.name+"\"大小超过100MB");
				return;
			}
			var todo = defaults.getComputedTodoValue(tr.querySelector('select[name="todo"]'));
			var Description = defaults.getComputedDescriptionValue(tr.querySelector('input[name="description"]'));
			var Revision = defaults.getComputedVersionValue(tr.querySelector('input[name="version"]'));
			cFile.valid=true;
			cFile.request={
				file: cFile.file,
				//typeof file.webkitRelativePath==="string"&&file.webkitRelativePath.length>0,判断文件夹or文件
				isDirectory: !!cFile.webkitRelativePath,
				folderId: folderId,
				option: todo==="upgrade"?"update":todo,
				webkitRelativePath: cFile.webkitRelativePath,
				Name: cFile.Name,
				ParentId: cFile.ParentId,
				Description: Description,
				DocCode: cFile.DocCode,
				Revision: Revision,
				DocId: cFile.DocId,
				//xhrFunction: new Function(),
				//forData: new FormData()
			};
			validClientFiles.push(cFile);
		});
		// 文件开始上传
		Array.prototype.forEach.call(validClientFiles,function(cFile){
			var file=cFile.file;
			delete cFile.file;
			var request=cFile.request;
			request.xhrFunction=function(){
				return xhr;
			};
			var xhr=new XMLHttpRequest();
			var task=new UploadTask(file,currentFolder,xhr,uploadGrid,"添加");
			tasks.push(task);
			var formData=new FormData();
			formData.append("file",file);
			request.formData=formData;
			exhibitionNum.attr("data-num",+exhibitionNum.attr("data-num")+1);
			var prom1=folderService.uploadFolder(request,this).then(function(response){
				task.code=response.code;
				var row=uploadGrid.find('tbody>tr[data-id="'+task.id+'"]');
				row[0].scrollIntoView();
				if(response.code===0){
					uploadStat.successFiles.push(file);
					uploadStat.successMessages.push("文件\""+file.name+"\"上传成功");
					row.attr("data-state","done");
					row.find('>td[axis="Progress"]>.nowrap').text("已完成");
					var fileInfo=response.data[0];
					task.file.id=fileInfo.fileid;
				}else{
					uploadStat.errorFiles.push(file);
					uploadStat.errorMessages.push(response.message);
					row.attr("data-state","done");
					row.find('>td[axis="Progress"]>.nowrap').text("上传失败");
				}
			},function(err){
				//console.log("文件\""+file.name+"\"上传时出错："+err);
				uploadStat.errorFiles.push(file);
				uploadStat.errorMessages.push("文件\""+file.name+"\"上传时出错："+err);
			});
			prom1.always(function(){
				var uploading=Math.max(+exhibitionNum.attr("data-num")-1,0);
				exhibitionNum.attr("data-num",uploading);
				$(document).triggerHandler(new $.Event("uploadtasksprogress",{
					uploading:uploading
				}));
			});
			promises.push(prom1);
		});
		$("#dlgToUpload2").modal("hide");
		var toFilesMessage=function(files){
			return files.length==1?"文件\""+files[0].name+"\"":"\""+files[0].name+"\"等"+files.length+"个文件"
		};
		if(uploadStat.rejectedFiles.length){
			var message=toFilesMessage(uploadStat.rejectedFiles)+"将不上传：文件大小为0B，或超过100MB，或已存在同名文件";
			$.pnotify(message,"","notice");
		}
		if(tasks.length==0)
			return;
		$.when.apply($,promises).then(function(){
			//TODO
			/*if(uploadStat.successFiles.length){
				var message=toFilesMessage(uploadStat.successFiles)+"上传成功";
				$.pnotify(message,"","success");
			}*/
			homeFileGridApi.searchParams=currentFolder.Id;
			homeFileGridApi.load(homeFileGrid.children(qsFIRSTROWGROUP));
		},function(err){
			//TODO
			/*if(uploadStat.successFiles.length){
				var message=toFilesMessage(uploadStat.successFiles)+"上传成功";
				$.pnotify(message,"","success");
			}*/
			if(uploadStat.errorFiles.length){
				var message=toFilesMessage(uploadStat.errorFiles)+"上传失败："+uploadStat.errorMessages[0];
				$.pnotify(message,"","error");
			}
			homeFileGridApi.searchParams=currentFolder.Id;
			homeFileGridApi.load(homeFileGrid.children(qsFIRSTROWGROUP));
		});
		uploadTasks.push.apply(uploadTasks,tasks);
		uploadGridApi.load();
		$("#btnUploadList").dropdown("toggle");
		setTimeout(function(){
			var row=uploadGrid.find('tbody>tr[data-id="'+tasks[0].id+'"]');
			row[0].scrollIntoView();
		});
		$("#btnUploadList").parent().attr("data-allow-toggle-until",Date.now()+1000);
	});
	window.PathUtils=PathUtils;//XXX
	uploadListGrid.on("loaded",function(){
		defaults.reset();
		uploadListGrid.find('tr[data-type="Doc"] select[name="todo"]').on("change",function(){
			this.setAttribute("data-value",this.value);
			var tr=$(this).closest("tr");
			var computedValue=defaults.getComputedTodoValue(this);
			var txtInput=tr.find('input[name="version"]');
			if(computedValue==="upgrade"){
				txtInput.prop("readOnly",false).prop("value","");
			}else if(computedValue==="overwrite"){
				txtInput.prop("readOnly",true).prop("value",txtInput.attr("data-value"));
			}
		});
		// 监听版本号并校验
		uploadListGrid.find('tbody input[name="version"]').on("change",function(){
			var q=$(this).prop("value").trim();
			if(specialSymbol.test(q)) {
				$(this).prop("value","");
				return $.alertAsync("名称不能包含特殊字符\\/:*?<>|\"");
			}
			var isTure = $(this).attr('data-versions').match(/\S\S*/g)[0].indexOf(q);
			if (isTure!==-1) {
				$.alertAsync("此版本号已存在！");
				$(this).prop("value","");
			}
		});
		$("#txtDefaultVersion").on("change",function(){
			var that=$(this);
			var q=that.prop("value").trim();
			if(specialSymbol.test(q)) {
				that.prop("value","");
				return $.alertAsync("名称不能包含特殊字符\\/:*?<>|\"");
			}
			var tmpVersion = [];
			uploadListGrid.find('tbody input[name="version"]').each(function(index,input){
				tmpVersion.push(input.getAttribute("data-versions").match(/\S\S*/g));
			});
			tmpVersion.some(function(f){
				if(f[0].indexOf(q)!==-1) {
					that.prop("value","");
					uploadListGrid.find('tr[data-type="Doc"] input[name="version"]').attr("placeholder","");
					return $.alertAsync("此版本号已存在！");
				}
			});
		});
	});
	window.uploadListGrid=uploadListGrid;
	var uploadListGridApi=uploadListGrid.ariaGrid({
		rowgroupTemplate: uploadListGrid.find('template[data-role="typicalRowgroup"]')[0],
		rowTemplate: uploadListGrid.find('template[data-role="typicalRow"]')[0]
	}).data("ariaGrid");
	uploadListGridApi.dataFunction=function(rowgroup){
		var folderId=currentFolder.Id;//currentFolder.Id 6270 16
		var sentFiles=clientFiles.map(function(cFile){
			return {
				Name: cFile.Name,
				Type: cFile.Type,
				webkitRelativePath: cFile.file["webkitRelativePath"]
			};
		});
		var data={
			isDirectory:true,
			folderId: folderId,//currentFolder.Id
			files: sentFiles
		};
		return folderService.uploadFileCheck(data,this).then(function(response){
			//$("#btnSubmitFiles").removeAttr("disabled");
			if(response.code===0) {
				return getMergedFiles(response.data,clientFiles);
			}
			throw new Error(response.message);
		});
	};
	uploadListGridApi.rowFunction=function(data,index,list){
		var row=this.typicalRow.cloneNode(true);
		var type=data['Type'];
		row.setAttribute("data-id",data['Id']);
		row.setAttribute("data-type",type);
		var rowLabel=row.querySelector('[axis="name"]>.row-label');
		rowLabel.textContent=data['Name'];
		row.setAttribute("data-type",data['Type']);
		var suffix=getExtension(data.name).toLowerCase();
		var perceivedType=mimeUtils.getPerceivedTypeBySuffix(suffix);
		rowLabel.setAttribute("data-perceived-type",perceivedType);
		rowLabel.setAttribute("data-ext",suffix);
		var iconUrl=mimeUtils.getIconBySuffix(suffix);
		if(iconUrl)
			rowLabel.style.backgroundImage='url("'+iconUrl+'")';
		if(data['Revision']) {
			row.querySelector('input[name="version"]').setAttribute("data-value",data["Revision"]);
			row.querySelector('input[name="version"]').setAttribute("data-versions",data["Revisions"].toString());
			$(row).css("background","#ed8a8a");
		}
		if(data['DocCode'])
			row.setAttribute("data-doc-code",data["DocCode"]);
		if(data['Description'])
			row.querySelector('[name="description"]').value=data["Description"];
			row.querySelector('select[name="todo"]').appendChild(createOptions(type,data["Code"]));
		return row;
	};
	//分享(批量)
	$("#btnShare").on("click",function(){
		var items=homeFileGridApi.selectedObjects;
		if(items.length==0)
			return;
		var name;
		if(items.length==1){
			name=items[0].Name;
		}else{
			name=items[0].Name+"等";
		}
		$('#frmShare input[name="Name"]').prop("value",name);
		$("#dlgShare").modal("show");
	});
	$('#frmShare input[name="Name"]').on("input",function(){
		$("#frmShare .btn-primary").prop("disabled",this.value.trim()=="");
	});
	
//  $("#dlgShareLink .btn-copy").on("click",function(){
//      $('input[name="ShareLink"]')[0].select();
//      $.pnotify("链接地址复制成功，它在您的剪切板中！","提示","success");
//  });
	$("#frmShare .btn-primary").on("click",function(){
		var data={Name:"",AuthID:xhrConfig.user.Id,Authority:1,FolderIds:[],DocIds:[],ShareAuthority:'',ExpDate:''};
		var items=homeFileGridApi.selectedObjects;
		if(items.length==0)
			return;
		items.forEach(function(item){
			(item.Type=="Folder"?data.FolderIds:data.DocIds).push(item.Type=="Folder"?item.Id:item.DocId);
		});
		data.ShareAuthority=Array.prototype.map.call($('#frmShare input[name="Allow"]'),function(input){
			return input.checked?input.value:"-";
		}).join("");
		data.Name=$('#frmShare input[name="Name"]').prop("value").trim();
		data.ExpDate=DateFormat.formatLocalString(new Date(Date.now()+86400000*30));
		shareService.shareDOF2Users(data).then(function(response){
			if(response.code==0){
				var link=$('meta[name="baseSharingLink"]').prop("content");
				link+="?"+$.param({uuid:response.data[0]});
				$('input[name="ShareLink"]').prop("value",link);
				var copyButton=$("#dlgShareLink .btn-copy")[0];
				if(copyButton)
					copyButton.setAttribute("data-clipboard-text",link);
				var name=data.Name;
				if(name.length>8)
					name=name.substring(0,6)+"~1";
				var text="[share] "+link;
				var qrCode=new QRCode($("#qrShareLink").empty()[0],{
					text:text,
					width:192,
					height:192
				});
				$("#dlgShare").modal("hide");
				$("#dlgShareLink").modal("show");
				$('input[name="ShareLink"]')[0].select();
			}else{
				$.pnotify(response.message,"错误提示","error");
			}
		});
	});
	//下载(批量)
	$("#btnDownload").on("click",function(){
		var selectedObjects=homeFileGridApi.selectedObjects;
		if(selectedObjects.length==0)
			return;
		var zipName=selectedObjects[0].Name;
		if(selectedObjects.length>1){
			zipName+="等";
		}
		var formData={
			Folders:[],
			Files:[],
			zipName:zipName
		};
		selectedObjects.forEach(function(data){
			if(data.Type=="Folder"){
				formData.Folders.push({id:data.Id});
			}else{
				formData.Files.push({id:data.Id});
			}
		});
		documentService.batchDownlode(formData);
	});
	//移动到回收站(批量)
	$("#btnDelete").on("click",function(){
		var selectedObjects=homeFileGridApi.selectedObjects;
		if(selectedObjects.length==0)
			return;
		$.confirmAsync("确定要将选中项移动到回收站?删除文件在回收站中保留30天后自动清除").then(function(confirmed){
			if(!confirmed)return;
			$("#btnDownload,#btnShare,#btnDelete").toggleClass("disabled",true);
			var formData=selectedObjects.map(function(data){
				var item={Type:data["Type"],Id:data["Id"],FromFolderId:currentFolder.Id};
				if(data.Type!="Folder")
					item["DocId"]=data.DocId;
				return item;
			});
			var folderId=currentFolder.Id;
			inodeService.moveInodesToRecycle(formData).then(function(response){
				if(response.code==0){
					homeFileGridApi.searchParams=currentFolder.Id;
					homeFileGridApi.load(homeFileGrid.children(qsFIRSTROWGROUP));
					homeTreeApi.load(homeTreeApi.findItemById(folderId));
					$.pnotify("删除成功","","success");
				}else{
					homeFileGridApi.searchParams=currentFolder.Id;
					homeFileGridApi.load(homeFileGrid.children(qsFIRSTROWGROUP));
					homeTreeApi.load(homeTreeApi.findItemById(folderId));
					$.pnotify(response.message,"错误提示","error");
				}
			});
		});
	});
	//给隐藏了文本的按钮加上title
	$(".btn.hide-text").titleButton();
	//给有aria-label但没title的元素加上title
	$("[aria-label]:not([title])").each(function(index,elem){
		elem.title=elem.getAttribute("aria-label");
	});
	$('.modal').attr("data-backdrop","static");
	//在窗口尺寸变化时调整.home-group的最大高度
	(function(){
		var userMenu=$(".user-menu");
		var group=$("#homeTree .home-group");
		var extraTree=$("#extraTree");
		var adjustHomeGroup=function(){
			var h=userMenu.height()-extraTree.height()-32;
			group.css("max-height",h+"px");
		};
		$(window).on("resize",adjustHomeGroup);
		adjustHomeGroup();
	}());
	//======== search grid ========
	var searchResultFileGrid=$("#searchResultFileGrid");
	var searchResultFileGridApi=searchResultFileGrid.ariaGrid({
		rowgroupTemplate: "#tplSearchFileGridRowgroup",
		rowTemplate: "#tplSearchFileGridRow"
	}).data("ariaGrid");
	searchResultFileGridApi.dataFunction=function(rowgroup){
		var that=this;
		return documentService.searchDocument({q:this.searchParams},this).then(function(response){
			var data=response.data;
			var gridApi=$(this).data("ariaGrid");
			var regex=new RegExp(escapeRegExp(that.searchParams),"ig");
			data.forEach(function(item){
				if(item["Type"]!="Folder"){
					if(!item["Revision"])
						item["Revision"]="1.0";
					item["Location"]=normalizePath(item["Path"]);
				}
				item["NameHTML"]=toHighlightHTML(item["Name"],regex);
			});
			return response.data;
		});
	};
	searchResultFileGridApi.rowFunction=function(data,index,list,contextGroup){
		var row=this.typicalRow.cloneNode(true);
		var type=data["Type"];
		row.setAttribute("data-id",data["Id"]);
		row.setAttribute("data-type",type);
		row.className+=" direction-item";
		var rowToggle=row.querySelector('[axis="Id"]>input[name="Id"]');
		rowToggle.id="chk"+contextGroup.attr("data-uuid")+data["Id"];
		rowToggle.value=data["Id"];
		var rowLabel=row.querySelector('[axis="Name"]>.row-label');
		if(data["NameHTML"]){
			rowLabel.innerHTML=data["NameHTML"];
		}else{
			rowLabel.textContent=data["Name"];
		}
		if(data["Description"])
			rowLabel.title=data["Description"];
		if(data["Location"])
			row.querySelector('[axis="Location"]>.nowrap').textContent=data["Location"];
		row.querySelector('[axis="LastModified"]').textContent=DateFormat.formatLocalString(data["LastModifyTime"]);
		if(type!="Folder"){
			var suffix=getExtension(data.Name).toLowerCase();
			var perceivedType=mimeUtils.getPerceivedTypeBySuffix(suffix);
			rowLabel.setAttribute("data-perceived-type",perceivedType);
			rowLabel.setAttribute("data-ext",suffix);
			var iconUrl=mimeUtils.getIconBySuffix(suffix);
			if(iconUrl){
				rowLabel.style.backgroundImage='url("'+iconUrl+'")';
			}
			row.querySelector('[axis="Type"]>.nowrap').textContent=data["Format"]||"文件";
			row.querySelector('[axis="Size"]').textContent=NumberFormat.formatShortIECBytes(data["Size"],2);
			row.querySelector('[axis="Revision"]>.rev').textContent=data["Revision"]||"\xA0";
			row.setAttribute("data-doc-code",data["DocCode"]);
		}else{
			rowLabel.setAttribute("data-ext",".");
			row.querySelector('[axis="Type"]').textContent="文件夹";
		}
		return row;
	};
	$("#frmSearch input[name='q']").on("input",function(){
		var q=$("input[name='q']").prop("value").trim();
		if(specialSymbol.test(q))
			return $.alertAsync("名称不能包含特殊字符\\/:*?<>|\"");
		if(!q){
			homeFileGridApi.jqGrid.find('tbody>tr').removeClass("hidden");
		}else{
			q=q.replace(/"/g,"\\$1").toLowerCase();
			var selector='[data-name*="'+q+'"]';
			homeFileGridApi.jqGrid.find('tbody>tr').each(function(index,tr){
				var name=tr.getAttribute("data-name");
				if(name&&name.indexOf(q)>-1){
					tr.classList.remove("hidden");
				}else{
					tr.classList.add("hidden");
				}
			});
		}
	});
	var btnSearch=$("#btnSearch");
	//该事件将在searchResultFileGrid数据加载完成后触发
	searchResultFileGrid.on("loaded",function(){
		btnSearch.attr("aria-busy",false);
	});
	$("#frmSearch").on("submit",function(){
		if(btnSearch.attr("aria-busy")=="true"){
			return;
		}
		btnSearch.attr("aria-busy",true);
		var q=$("input[name='q']").val().trim();
		if(specialSymbol.test(q))
			return $.alertAsync("名称不能包含特殊字符\\/:*?<>|\"");
		$(".keyword").text("\""+q+"\"");
		if(!q){return;}
		$("#searchToolbar>.form-container").append($("#frmSearch"));
		//homeTreeApi.selectedItem=null;
		if(!$("#panelSeachResult").is(":visible")){
			$("#panelHome").hide();
			$("#panelSeachResult").show();
		}
		searchResultFileGridApi.searchParams=q;
		searchResultFileGridApi.load(searchResultFileGrid.children(qsFIRSTROWGROUP));
	});
	$("#lnkBackHome").on("click",function(e){
		e.preventDefault();
//      $("input[name='q']").val("");
		$("#homeToolbar>.form-container").append($("#frmSearch"));
		$("#panelSeachResult").hide();
		$("#panelHome").show();
	});
	searchResultFileGrid.on("click",".row-label",function(){
		var row=$(this).closest("tr");
		var data=row.prop("data");
		openFile(data);
	});

	//======== sent grid ========
	var sentFileGrid=$("#sentFileGrid");
	var btnDeleteSent= $("#btnDeleteSent");
	var sentFileGridApi=sentFileGrid.ariaGrid({
		rowgroupTemplate: "#tplSentFileGridRowgroup",
		rowTemplate: "#tplSentiveFileGridRow",
		onLoaded:function(e){
			var jqTbody=e.detail
			jqTbody.find('i[data-toggle="tooltip"]').tooltip();
		},
		onUnloaded:function(e){
			btnDeleteSent.prop("disabled",true);
		},
		onSelectedrow:function(e){
			btnDeleteSent.prop("disabled",false);
		},
		onDeselectedrow:function(e){
			if(sentFileGridApi.selectedRows.length==0)
				btnDeleteSent.prop("disabled",true);
		},
	}).data("ariaGrid");
	sentFileGridApi.dataFunction=function(rowgroup){
		return shareService.getSendedDOF({Id:this.searchParams},this).then(function(response){
			return response.data;
		});
	};
	sentFileGridApi.rowFunction=function(data,index,list,contextGroup){
		var row=this.typicalRow.cloneNode(true);
		row.setAttribute("data-id",data["Id"]);
		var rowToggle=row.querySelector('[axis="Id"]>input[type="checkbox"]');
		rowToggle.id="chk"+contextGroup.attr("data-uuid")+data["Id"];;
		rowToggle.value=data["Id"];
		var rowLabel=row.querySelector('[axis="Name"]>.row-label');
		rowLabel.textContent=data["Name"];
		if(data["Description"])
			rowLabel.title=data["Description"];
		row.querySelector('[axis="CreateTime"]').textContent=DateFormat.formatLocalString(data["CreateTime"]);
//      row.querySelector('[axis="Authority"]').textContent=data["ShareAuthority"];
		var chs=data["ShareAuthority"].match(/\S/g)||[];
		var selectorText=chs.reduce(function(str,ch){
			if(ch!="-")
				str+=':not([data-auth*="'+ch+'"])';
			return str;
		},"[data-auth]");
		//淡现权限，隐藏权限
		$(row.querySelectorAll(selectorText)).css("background-color","#e3e2e2");
		$(row.querySelectorAll(selectorText + ":not([class*='char-icon'])")).css("visibility","hidden");
		//以下用于连接复制到剪切板功能，定义使用data-clipboard-text属性
		var link=baselink+"?"+$.param({uuid:data["Link"]});
		var button=row.querySelector('.btn-copyLink');
		button.setAttribute("data-clipboard-text",link);
		$(button).onClickExecCopy();//给按钮注册了点击事件，触发点击事件后会复制data-clipboard-text的值
		return row;
	};
	//发送文件批量删除
	btnDeleteSent.on("click",function(){
		var selectedObjects=sentFileGridApi.selectedObjects;
		if(selectedObjects.length==0)
			return;
		var data=selectedObjects.map(function(inode){
			var item=inode["UUID"];
			return item;
		});
		$.confirmAsync("确定删除选中的" + selectedObjects.length + "项吗?").then(function(confirmed){
			if(!confirmed)return;
			shareService.batchDeleteSentAndReceivedDOF({data:data,type:"deletesend"},null).then(function(response){
				if(response.code==0){
					sentFileGridApi.load(sentFileGridApi.jqGrid.children(qsFIRSTROWGROUP));
					return $.alertAsync("删除成功");
				}else{
					$.alertAsync(response.message);
				}
			});
		});
	});

	//======== receive grid ========
	var receiveFileGrid=$("#receiveFileGrid");
	var btnDeleteReceived= $("#btnDeleteReceived");
	var receiveFileGridApi=receiveFileGrid.ariaGrid({
		rowgroupTemplate: "#tplReceiveFileGridRowgroup",
		rowTemplate: "#tplReceiveFileGridRow",
		onLoaded:function(e){
			var jqTbody=e.detail
			jqTbody.find('i[data-toggle="tooltip"]').tooltip();
		},
		onUnloaded:function(e){
			btnDeleteReceived.prop("disabled",true);
		},
		onSelectedrow:function(e){
			btnDeleteReceived.prop("disabled",false);
		},
		onDeselectedrow:function(e){
			if(receiveFileGridApi.selectedRows.length==0)
				btnDeleteReceived.prop("disabled",true);
		},
	}).data("ariaGrid");
	receiveFileGridApi.dataFunction=function(rowgroup){
		return shareService.getReceivedDOF(null,this).then(function(response){
			return response.data;
		});
	};
	receiveFileGridApi.rowFunction=function(data,index,list,contextGroup){
		var row=this.typicalRow.cloneNode(true);
		var id=data["Link"];
		row.setAttribute("data-id",id);
		var rowToggle=row.querySelector('[axis="Id"]>input[type="checkbox"]');
		rowToggle.id="chk"+contextGroup.attr("data-uuid")+id;
		rowToggle.value=id;
		row.querySelector('[axis="Sender"]').textContent=data["Sender"];
		row.querySelector('[axis="ReceivedDate"]').textContent=DateFormat.formatLocalString(data["ReceiveTime"]);
		var rowLabel=row.querySelector('[axis="Name"]>.row-label');
		rowLabel.textContent=data["Name"];
		if(data["Description"])
			rowLabel.title=data["Description"];
		row.querySelector('[axis="SentDate"]').textContent=DateFormat.formatLocalString(data["SendTime"]);
		//给隐藏了文本的按钮加上title
		var chs=data["ShareAuthority"].match(/\S/g)||[];
		var selectorText=chs.reduce(function(str,ch){
			if(ch!="-")
				str+=':not([data-auth*="'+ch+'"])';
			return str;
		},"[data-auth]");
		var selectorText=chs.reduce(function(str,ch){
			if(ch!="-")
				str+=':not([data-auth*="'+ch+'"])';
			return str;
		},"[data-auth]");
		//淡现权限，隐藏权限
		$(row.querySelectorAll(selectorText)).css("background-color","#e3e2e2");
		$(row.querySelectorAll(selectorText + ":not([class*='char-icon'])")).remove();
		//以下用于连接复制到剪切板功能，定义使用data-clipboard-text属性
		var link=baselink+"?"+$.param({uuid:data["Link"]});
		var button=row.querySelector('.btn-copyLink');
		button.setAttribute("data-clipboard-text",link);
		$(button).onClickExecCopy();//给按钮注册了点击事件，触发点击事件后会复制data-clipboard-text的值
		return row;
	};
	
	//收到文件批量删除
	btnDeleteReceived.on("click",function(){
		var selectedObjects=receiveFileGridApi.selectedObjects;
		if(selectedObjects.length==0)
			return;
		var data=selectedObjects.map(function(inode){
			var item=inode["UUID"];
			return item;
		});
		$.confirmAsync("确定删除选中的" + selectedObjects.length + "项吗?").then(function(confirmed){
			if(!confirmed)return;
			shareService.batchDeleteSentAndReceivedDOF({data:data,type:"deletereceive"},null).then(function(response){
				if(response.code==0){
					receiveFileGridApi.load(receiveFileGridApi.jqGrid.children(qsFIRSTROWGROUP));
					return $.alertAsync("删除成功");
				}else{
					$.alertAsync(response.message);
				}
			});
		});
	});

	//======== detail grid ========
	var detailFileGrid=$("#detailFileGrid");
	var detailFileGridApi=detailFileGrid.ariaGrid({
		rowgroupTemplate: "#tplDetailFileGridRowgroup",
		rowTemplate: "#tplDetailFileGridRow",
		onLoaded:function(e){
			var jqTbody=e.detail
			jqTbody.find('i[data-toggle="tooltip"]').tooltip();
		}
	}).data("ariaGrid");
	detailFileGridApi.dataFunction=function(rowgroup){
		var ShareAuthority=this.ShareAuthority;
		var type=this.tag=="sentFileGrid"?"detailsend":"detailreceive";
		var folderId=this.currentFolder?this.currentFolder.Id:0;
		return shareService.getDOFDetails({uuid:this.currentLink.UUID,folderId:folderId,type:type},this).then(function(response){
			var data=response.data;
			data.forEach(function(item){
				if(item["Type"]!="Folder"){
					if(!item["Revision"])
						item["Revision"]="1.0";
				}
				item.ShareAuthority=ShareAuthority;
			});
			return response.data;
		});
	};
	detailFileGridApi.rowFunction=function(data,index,list,contextGroup){
		var gridId=this.jqGrid.attr("id");
		var row=this.typicalRow.cloneNode(true);
		var type=data["Type"];
		row.setAttribute("data-id",data["Id"]);
		row.setAttribute("data-type",type);
		var rowToggle=row.querySelector('[axis="Id"]>input[name="Id"]');
		rowToggle.id="chk"+contextGroup.attr("data-uuid")+data["Id"];
		rowToggle.value=data["Id"];
		var rowLabel=row.querySelector('[axis="Name"]>.row-label');
		rowLabel.innerHTML=data["Name"];
		if(data["Description"])
			rowLabel.title=data["Description"];
		if(gridId=="trashFileGrid"){
			row.querySelector('[axis="OrgPath"]>.nowrap').textContent=data["OrgPath"];
			row.querySelector('[axis="DeleteDate"]').textContent=DateFormat.formatLocalString(data["DeleteDate"]);
		}else {
			row.querySelector('[axis="LastModified"]').textContent=DateFormat.formatLocalString(data["LastModifyTime"]);
		}
		if(type=="Folder"){
			rowLabel.setAttribute("data-ext",".");
			row.querySelector('[axis="Type"]').textContent="文件夹";
		}else{
			var suffix=getExtension(data.Name);
			rowLabel.setAttribute("data-ext",suffix);
			rowLabel.setAttribute("data-perceived-type",mimeUtils.getPerceivedTypeBySuffix(suffix));
			row.querySelector('[axis="Type"]>.nowrap').textContent=data["Format"]||"文件";
			row.querySelector('[axis="Size"]').textContent=NumberFormat.formatShortIECBytes(data["Size"],2);
			row.querySelector('[axis="Revision"]').textContent=data["Revision"]||"\xA0";
			$(rowLabel).attr("data-is-latest",data["IsLatestRevision"]);
			if(!data["IsLatestRevision"]){
				$(row.querySelectorAll(".btn-checkin,.btn-rename")).remove();
			}
		}
		var chs=data["ShareAuthority"].match(/\S/g)||[];
		var selectorText=chs.reduce(function(str,ch){
			if(ch!="-")
				str+=':not([data-auth*="'+ch+'"])';
			return str;
		},"[data-auth]");
		$(row.querySelectorAll(selectorText)).remove();
		return row;
	};
	$("#lnkDetailBackHome").on("click",function(e){
		e.preventDefault();
		$("#panelDetailResult").hide();
		
		if(detailFileGridApi.tag=="sentFileGrid")
			$("#panelSent").show();
		if(detailFileGridApi.tag=="receiveFileGrid")
			$("#panelReceive").show();
		
		selectedRouteArray=[];
	});
	
	var breadcrumbDetail=$("#locationPathDetail");
	var breadcrumbDetailbApi=breadcrumbDetail.ariaBreadcrumb({
		linkitemTemplate: "#tplLinkitem",
		textitemTemplate: "#tplTextitem"
	}).data("ariaBreadcrumb");
	breadcrumbDetailbApi.linkitemFunction=function(data,index){
		var linkitem=this.typicalLinkitem.cloneNode(true);
		linkitem.querySelector("a").textContent=data["Name"];
		return linkitem;
	};
	breadcrumbDetailbApi.textitemFunction=function(data,index){
		var textitem=this.typicalTextitem.cloneNode(true);
		textitem.textContent=data["Name"];
		textitem.setAttribute("class","active");
		return textitem;
	};
	function onExtraLoaded(){
	var fileGrids=$();
	fileGrids.push(homeFileGridApi.jqGrid[0],searchResultFileGridApi.jqGrid[0]);
	//覆写或提交
	var currentRow;
	var currRev1;
	fileGrids.on("click",".btn-checkin"+qsNOTBUSY,function(e){
		var btn=$(this);
		var row=btn.closest("tr");
		currentRow=row.prop("data");
		$("#spanOldFilename").text(currentRow.Name);
		$("#spanCurrentRevision").text(currentRow.Revision);
		$("#frmVersionManagement")[0].reset();
		$("#rdoSubmitNew").trigger("click");
		$("#dlgVersionManagement").modal("show");
		currRev1=$("#spanCurrentRevision").text();
		//判断当前版本号的最后一位是否为数字
		currRev1=getNewVer(currRev1);
		//给新版本号赋值为当前版本号自动加一
		$("#txtNewRevision").val(currRev1);
	});
	$("#dlgVersionManagement").on("show.bs.modal",function(){
		$("#frmVersionManagement").data('bootstrapValidator').resetForm(true);
	}).on("shown.bs.modal",function(){
		$('input[name="file"]',this).focus();
	});
	//动态监测radio的选中框为'升级版本'或'覆盖并提交'
	$("input[name='updateorreplace']").on("change",function(){
		var bootstrapValidator = $("#frmVersionManagement").data('bootstrapValidator');
		if($("input[name='updateorreplace']:checked").val()=='2'){
		
			$(".submit-option,.version").css('visibility','hidden');
			bootstrapValidator.enableFieldValidators("revision","disabled");
			$("#txtNewRevision").prop("disabled",true);
		}
		else{
			$(".submit-option,.version").css('visibility','visible');
			$("#txtNewRevision").prop("disabled",false);
			$("#txtNewRevision").val(currRev1);//防止其误删新版本号，赋值使其通过校验
			bootstrapValidator.enableFieldValidators("revision","enabled");
			bootstrapValidator.updateStatus('revision', 'NOT_VALIDATED').validateField('revision');
		}
	});
	$(".submit-options").tabs(".submit-option",{
		tabs:'input[type="radio"]',
		wouldDefaultPrevented:false
	});
	$("#frmVersionManagement").bootstrapValidator().on("success.form.bv",function(e){
		e.preventDefault();
		if(!$("#frmVersionManagement").data("bootstrapValidator").isValid())
			return;
		var input=document.getElementById("inputfileForUpdate");
		var oldFilename=$("#spanOldFilename").text();
		var filename=PathUtils.basename(input.value);
		if(filename!=oldFilename)
			return $.alertAsync("文件名无效！\n应保证所选文件的名称与原文件名称一致！");
		var formData=new FormData($("#frmVersionManagement")[0]);
		var data={};
		data.formData=formData;
		var SUBMIT="1";
		var OVERWRITE="2";
		var chosen=$("input[name='updateorreplace']:checked").val();
		var description=$('input[name="comment"]').val().trim();
		var xhr=new XMLHttpRequest();
		var file=input.files[0];
		var task=new UploadTask(file,currentFolder,xhr,uploadGridApi.jqGrid);
		var exhibitionNum=$(".exhibitionNum");
		exhibitionNum.attr("data-num",+exhibitionNum.attr("data-num")+1);
		$('#dlgVersionManagement').modal("hide");
		if(chosen==OVERWRITE){
			task.action="覆盖";
			uploadTasks.push(task);
			data.fileid=currentRow.Id;
			data.Code=currentRow.DocCode;
			data.description=description;
			data.xhrFunction=function(){return xhr;};
			documentService.replaceFile(data).then(function(response){
				exhibitionNum.attr("data-num",Math.max(+exhibitionNum.attr("data-num")-1,0));
				task.code=response.code;
				if(response.code==0){
					$.pnotify("文件\""+currentRow.Name+"\"覆盖成功","","success");
					uploadGrid.find('tbody>tr[data-id="'+task.id+'"]>td[axis="Progress"]>.nowrap').text("已完成");
					homeFileGridApi.searchParams=currentFolder.Id;
					homeFileGridApi.load(homeFileGrid.children(qsFIRSTROWGROUP));
					//TODO do sort
					$('#btnVersionManagementReset').trigger("click");
					$(".submit-option,.version").css('visibility','visible');
					$("#txtNewRevision").prop("disabled",false);
				}else{
					$.pnotify(response.message,"错误提示","error");
					uploadGrid.find('tbody>tr[data-id="'+task.id+'"]>td[axis="Progress"]>.nowrap').text("上传失败");
				}
			},function(error){
				exhibitionNum.attr("data-num",Math.max(+exhibitionNum.attr("data-num")-1,0));
				$.pnotify("文件\""+currentRow.Name+"\"上传出错","","error");
			});
		}else{
			var newRev=$.trim($("#txtNewRevision").val());
			var currRev=$("#spanCurrentRevision").text();
			if(currRev==newRev)
				return $.alertAsync("新版本号不能与当前版本号相同");
			task.action="升级";
			uploadTasks.push(task);
			data.new_revision=newRev;
			data.doc_code=currentRow.DocCode;
			data.folderid=currentFolder.Id;
			data.description=description;
			data.xhrFunction=function(){return xhr;};
			documentService.addNewVersionFile(data).then(function(response){
				exhibitionNum.attr("data-num",Math.max(+exhibitionNum.attr("data-num")-1,0));
				task.code=response.code;
				if(response.code==0){
					$.pnotify("文件\""+currentRow.Name+"\"已更新到版本"+newRev,"","success");
					uploadGrid.find('tbody>tr[data-id="'+task.id+'"]>td[axis="Progress"]>.nowrap').text("已完成");
					homeFileGridApi.searchParams=currentFolder.Id;
					homeFileGridApi.load(homeFileGrid.children(qsFIRSTROWGROUP));
				}else{
					$.pnotify(response.message,"错误提示","error");
					uploadGrid.find('tbody>tr[data-id="'+task.id+'"]>td[axis="Progress"]>.nowrap').text("上传失败");
				}
			},function(){
				exhibitionNum.attr("data-num",Math.max(+exhibitionNum.attr("data-num")-1,0));
				$.pnotify("文件\""+currentRow.Name+"\"上传出错","","error");
			});
		}
		uploadGridApi.load();
		$("#btnUploadList").dropdown("toggle");
		setTimeout(function(){
			var row=uploadGrid.find('tbody>tr[data-id="'+task.id+'"]');
			row[0].scrollIntoView();
		});
		$("#btnUploadList").parent().attr("data-allow-toggle-until",Date.now()+1000);
	});
	//选中覆盖并提交按钮，并未提交而点击取消按钮，将升级版本的隐藏框显示。
	$(".btn-default.cancel-update").on("click",function(){
		$(".submit-option,.version").css('visibility','visible');
		$("#txtNewRevision").prop("disabled",false);
		$("#frmVersionManagement").data('bootstrapValidator').resetForm(true);
	});
	//检出
	fileGrids.on("click",".btn-checkout"+qsNOTBUSY,function(e){
		var btn=$(this);
		var row=btn.closest("tr");
		var data=row.prop("data");
		if(data.Type=="Folder"){
			documentService.batchDownlode({
				Folders:[{id:data.Id}],
				Files:[],
				zipName:data.Name
			});
		}else{
			var url = xhrConfig.resolvePath("v1s/documents/file/download/"+data.Id)+
					"?cn="+encodeURIComponent(xhrConfig.user.SpecCode);
			location.href = url;
		}
	});
	//移动到回收站
	fileGrids.on("click",".btn-delete"+qsNOTBUSY,function(e){
		var fileGrid=$(e.delegateTarget);
		var fileGridApi=fileGrid.data("ariaGrid");
		var row=$(this).closest("tr");
		var data=row.prop("data");
		var currFolder=currentFolder;
		$.confirmAsync("确定要将\""+data["Name"]+"\"移动到回收站?\n删除文件在回收站中保留30天后自动清除").then(function(confirmed){
			if(!confirmed)return;
			var formData={Type:data["Type"],Id:data["Id"],FromFolderId:currentFolder.Id};
			if(data["Type"] == "Folder"){   // 删除文件夹
				recycleService.moveSingleDOF2Recycle(formData).then(function(response){
					if(response.code==0){
						$.pnotify("删除成功","","success");
						fileGridApi.searchParams=currFolder.Id;
						fileGridApi.load(fileGrid.children(qsFIRSTROWGROUP));
						homeTreeApi.load(homeTreeApi.findItemById(currFolder.Id));
					}else{
						$.pnotify(response.message,"错误提示","error");
					}
				});
			}else{                      // 删除文件
				formData.DocId=data["DocId"];
				recycleService.moveSingleDOF2Recycle(formData).then(function(response){
					if(response.code==0){
						$.pnotify("删除成功","","success");
						fileGridApi.searchParams=currentFolder.Id;
						fileGridApi.load(fileGrid.children(qsFIRSTROWGROUP));
					}else{
						$.pnotify(response.message,"错误提示","error");
					}
				});
			}
		});
	});

	var otherGrids=$();
	var trippleGrids=$();
	otherGrids.push(sentFileGridApi.jqGrid[0],receiveFileGridApi.jqGrid[0]);
	trippleGrids.push(sentFileGridApi.jqGrid[0],receiveFileGridApi.jqGrid[0],detailFileGridApi.jqGrid[0]);
	//已发文件、收到文件中的删除功能
	otherGrids.on("click",".btn-delete-d"+qsNOTBUSY,function(e){
		var row=$(this).closest("tr");
		var data=row.prop("data");
		$.confirmAsync("确定要删除\""+data["Name"]+"\"吗?").then(function(confirmed){
			if(!confirmed)return;
			var formData={uuid: data["UUID"],type:e.delegateTarget.id=="sentFileGrid"?"deletesend":"deletereceive"};
			shareService.deleteSentAndReceivedDOF(formData,null).then(function(response){
				if(response.code==0){
					$.pnotify("删除成功","","success");
					if(e.delegateTarget.id=="sentFileGrid")
						sentFileGridApi.load(sentFileGridApi.jqGrid.children(qsFIRSTROWGROUP));
					if(e.delegateTarget.id=="receiveFileGrid")
						receiveFileGridApi.load(receiveFileGridApi.jqGrid.children(qsFIRSTROWGROUP));
				}else{
					$.pnotify(response.message,"错误提示","error");
				}
			});
		});
	});
	//已发文件、收到文件中的转存功能
	trippleGrids.on("click",".btn-saveAs"+qsNOTBUSY,function(e){
		var row=$(this).closest("tr");
		var data=row.prop("data");
		if(data.Type)//如果Type不为空视为对文件和文件夹的转存
			$.confirmAsync("转存\""+data["Name"]+"\"到我的文档中?").then(function(confirmed){
				if(!confirmed)return;
				var formData={Type:data["Type"],Id:data["Id"]};
				if(data["Type"]!="Folder"){
					formData.Id=data["DocId"];//FIXME
					formData.DocId=data["DocId"];
				}
				shareService.saveAsSingleDOF(formData,null).then(function(response){
					if(response.code==0){
						$.pnotify("转存成功","","success");
						homeTreeApi.load(homeTreeApi.findItemById(homeFolder.Id));
					}else{
						$.pnotify(response.message,"错误提示","error");
					}
				});
			});
		else//反之视为对链接的转存
			$.confirmAsync("转存\""+data["Name"]+"\"到我的文档中?").then(function(confirmed){
				if(!confirmed)return;
				shareService.saveAsLinkDOF({uuid: data["UUID"]},null).then(function(response){
					if(response.code==0){
						$.pnotify("转存成功","","success");
						homeTreeApi.load(homeTreeApi.findItemById(homeFolder.Id));
					}else{
						$.pnotify(response.message,"错误提示","error");
					}
				});
			});
	});
	
	//显示分享或者接收明细
	otherGrids.on("click",".row-label"+qsNOTBUSY,function(e){
		var row=$(this).closest("tr");
		var data=row.prop("data");
		initdetailFileGrid(data,e.delegateTarget.id);
	});
	var initdetailFileGrid=function(data,gridId){
		detailFileGridApi.searchParams=data.UUID;
		detailFileGridApi.currentLink=data;
		detailFileGridApi.currentFolder=null;
		detailFileGridApi.name=data.Name;
		detailFileGridApi.ShareAuthority=data.ShareAuthority;
		detailFileGridApi.tag=gridId;
		detailFileGridApi.firstLoad=true;
		detailFileGridApi.load(detailFileGridApi.jqGrid.children(qsFIRSTROWGROUP));
		
		if(detailFileGridApi.firstLoad){
			selectedRouteArray=[];
		}
		
		if(selectedRouteArray.length==0){
			selectedRouteArray.push({Name:detailFileGridApi.tag=="sentFileGrid"?"已发文件":"收到文件",root:true})
			selectedRouteArray.push({Name:detailFileGridApi.name,Id:detailFileGridApi.searchParams,rootSecond:true})
			breadcrumbDetailbApi.pushState(selectedRouteArray,null);
		}
		else{
			selectedRouteArray[0].Name=detailFileGridApi.tag=="sentFileGrid"?"已发文件":"收到文件";
		}
		
		$("#panelDetailResult").show();
		if(gridId=="sentFileGrid")
			$("#panelSent").hide();
		if(gridId=="receiveFileGrid")
			$("#panelReceive").hide();
		$(".keywordDetail").text("\'"+data.Name+"\'");
	}
	
	//复制分享链接 aftercopy
	otherGrids.on("click",".btn-copyLink"+qsNOTBUSY,function(e){
		$.pnotify("复制链接地址成功，它在您的剪切板中！","提示","success");
	});
	
	// 设置转存
	var currentTransferData = null;
	$("#homeDAVExplorer .file-grid").on("click",".btn-saveas",function(){
		var row = $(this).closest("tr");
		var data = row.prop("data");
		currentTransferData=data;
		$("#dlgFileTransfer .modal-title").text(data["Name"] + " 转存到");
		var btn=$(this);
		if(btn.attr("aria-busy")=="true")
			return;
		btn.attr("aria-busy",true);
		var row = $(this).closest("tr");
		var data = row.prop("data");
		var persRootItem=persFileSaveTree.children();
		persRootItem.children('[role="group"]').children().remove();
		projFileSaveTree.children().remove();
		personService.getProjsHomeFolders({},this).then(function(response){
			btn.attr("aria-busy",false);
			var obj=response.data[0];
			persRootItem.prop("data",obj["PERDOC"]).removeAttr("aria-expanded");
			persFileSaveTreeApi.toggleItemById("0",true);
			persFileSaveTreeApi.load(persFileSaveTree.children()).then(function(){
				persFileSaveTreeApi.toggleItemById("0",true);
				persFileSaveTree.children('[role="treeitem"]').find(".node-label:eq(0)").click();
			});
			var typicalTreeitem=$("#fileSaveTreeTreeRootItem").prop("content").firstChild;
			obj["PRJDOC"].forEach(function(folder){
				var treeitem=typicalTreeitem.cloneNode(true);
				treeitem.data=folder;
				treeitem.setAttribute("data-id",folder["Id"]);
				$('[data-project-name]',treeitem).attr("data-project-name",folder["ProjectName"]);
				$('.text',treeitem).text(folder["ProjectName"]);
				projFileSaveTree.append(treeitem);
			});
		},function(){
			btn.attr("aria-busy",false);
		});
		$("#dlgFileTransfer").modal("show");
	});
	var persFileSaveTree=$("#persFileSaveTree");
	persFileSaveTree.on("selecteditem",function(){
		projFileSaveTree.find('[role="treeitem"][aria-selected="true"]').attr('aria-selected',false);
	});
	var persFileSaveTreeApi=persFileSaveTree.ariaTree({
		groupTemplate:"#fileSaveTreeGroup",
		treeitemTemplate:"#fileSaveTreeTreeitem"
	}).data("ariaTree");
	
	var filterFolders=function(data,requires){
		var list=requires==null?null:requires.split("");
		return data.filter(function(f){
			var permissions=f.permissions||"";
			if(f.Type=="Folder"&&f.Attributes&2||permissions.indexOf("r")==-1)
				return false;
			if(list&&!list.every(function(p){return permissions.indexOf(p)!=-1;}))
				return false;
			return true;
		});
	};
	
	persFileSaveTreeApi.dataFunction=function(treeitem){
		return folderService.getSubFoldersById({Id:treeitem.prop("data")["Id"]},this).then(function(response){
			return filterFolders(response.data);
		});
	};
	persFileSaveTreeApi.treeitemFunction=function(data,index,list,contextItem){
		var treeitem=this.typicalTreeitem.cloneNode(true);
		treeitem.querySelector(".node-label").textContent=data["Name"];
		treeitem.setAttribute("data-id",data["Id"]);
		treeitem.setAttribute("data-transfer-action","person");
		treeitem.setAttribute("data-type","Folder");
		treeitem.setAttribute("aria-level",+contextItem.attr("aria-level")+1);
		treeitem.setAttribute("aria-haspopup",true);
		return treeitem;
	};
	var projFileSaveTree=$("#projFileSaveTree");
	projFileSaveTree.on("selecteditem",function(){
		persFileSaveTree.find('[role="treeitem"][aria-selected="true"]').attr('aria-selected',false);
	});
	var projFileSaveTreeApi=projFileSaveTree.ariaTree({
		groupTemplate:"#fileSaveTreeGroup",
		treeitemTemplate:"#fileSaveTreeTreeitem"
	}).data("ariaTree");
	projFileSaveTreeApi.dataFunction=function(treeitem){
		return folderService.getSubFoldersById({Id:treeitem.prop("data")["Id"]},this).then(function(response){
			return filterFolders(response.data,"aw");
		});
	};
	projFileSaveTreeApi.treeitemFunction=function(data,index,list,contextItem){
		var treeitem=this.typicalTreeitem.cloneNode(true);
		treeitem.querySelector(".node-label").textContent=data["Name"];
		treeitem.setAttribute("data-transfer-action","project");
		treeitem.setAttribute("data-id",data["Id"]);
		treeitem.setAttribute("data-type","Folder");
		treeitem.setAttribute("aria-level",+contextItem.attr("aria-level")+1);
		treeitem.setAttribute("aria-haspopup",true);
		return treeitem;
	};
	
	// 设置转存的提交按钮
	$("#dlgFileTransfer").on("click",".btn-primary",function(){ 
		var selectedRow = $("#dlgFileTransfer li[aria-selected='true']");
		var transferFolderData = selectedRow.prop("data");
		var dumptype = selectedRow.attr("data-transfer-action")=="person" ?Transfer.PERSONAL_PERSONAL:Transfer.PERSONAL_PROJECT;
		var id = currentTransferData["Type"]== "Folder" ? currentTransferData["Id"] :   currentTransferData["DocId"];
		var data = {
			Id:id,
			Type:currentTransferData["Type"],
			ToFolderId:transferFolderData["Id"]
		}
		return personService.personTransferFile(data,dumptype,this).then(function(response){
			if(response.code==0){
				$.pnotify("转存成功","OK","success");
				$("#dlgFileTransfer").modal('hide');
			}else{
				$.pnotify("转存失败"+response.message,"ERROR","error");
				$("#dlgFileTransfer").modal('hide');
			}
		},function(error){
			$.pnotify("转存失败"+error,"ERROR","false");
			$("#dlgFileTransfer").modal('hide');
		}); 
	});

	//重命名
	var currentFileGridApi=null;
	var currentFile=null;
	$("#dlgRename").on("show.bs.modal",function(){
		$('#frmRename').data('bootstrapValidator').resetForm(true);
	}).on("shown.bs.modal",function(){
		$('input[name="Name"]',this).focus();
	});
	fileGrids.on("click",".btn-rename"+qsNOTBUSY,function(e){
		var row=$(this).closest("tr");
		var data=row.prop("data");
		$('#dlgRename').modal("show");
		$("#txtNewName").prop("value",data.Name).attr("data-value",data.Name);
		var oldDescription = data["Description"]||"";
		$("#dlgRename input[name='Description']").prop("value",oldDescription).attr("data-value",oldDescription);
		var baseNameNoExt=PathUtils.basenamenoext(data.Name);
		var input=$("#txtNewName")[0];
		input.setSelectionRange(0,baseNameNoExt.length);
		$('#btnSubmitRename').prop("disabled",true);
		currentFile=data;
		currentFileGridApi=$(e.delegateTarget).data("ariaGrid");
	});
	$("#txtNewName").on("input",function(){
		var newName=this.value.trim();
		$('#btnSubmitRename').prop("disabled",newName==""||newName==this.getAttribute("data-value"));
	});
	$('#frmRename').bootstrapValidator({
		fields : {
			Name: {
				validators: {
					regexp: {
						message: '名称不能包含特殊字符\\ \/ : * ? &lt; &gt; | &quot;'
					}
				}
			}
		}
	}).on("success.form.bv",function(e){
		e.preventDefault();
		if(!$("#frmRename").data("bootstrapValidator").isValid()){
			return;
		}
		var data=currentFile;
		var newName=$.trim($('#txtNewName').val());
		var description=$.trim($('input[name="Description"]').val());
		
		var fields=[];
		var copyOfData=$.extend(true,{},data);
		if(copyOfData["Name"]!=newName){
			fields.push("Name");
			copyOfData["Name"]=newName;
		}
		if(copyOfData["Description"]!=description){
			fields.push("Description");
			copyOfData["Description"]=description;
		}
		if(fields.length==0){
			$.pnotify("请输入不同的命名","","error");
			//把input框的内容全选中
			$('#txtNewName').focus();
			var baseNameNoExt=PathUtils.basenamenoext(newName);
			var input=$("#txtNewName")[0];
			input.setSelectionRange(0,baseNameNoExt.length);
			return;
		}
		copyOfData["fields"]=fields;
		
		if(data["Type"] == "Folder"){
			//copyOfData["Description"]=$.trim($("#frmRename>input[name='Description']").val());//为重命名添加描述字段
			folderService.renameFolder(copyOfData).then(function(response){
				if(response.code==0){
					$.pnotify("重命名成功","","success");
					$('#dlgRename').modal("hide");
					$('#btnSubmitRename').prop("disabled",true);
					data["Name"]=copyOfData["Name"];
					currentFileGridApi.searchParams=currentFolder.Id;
					currentFileGridApi.load(currentFileGridApi.jqGrid.children(qsFIRSTROWGROUP));
					homeTreeApi.load(homeTreeApi.selectedItem);
				}else{
					$.pnotify(response.message,"错误提示","error");
				}
			});
		}else{
			var oldExt=getExtension(data["Name"]);
			var newExt=getExtension(newName);
			var callback=function(confirmed){
				if(!confirmed){
					$("#txtNewName").val(data.Name);
					var baseNameNoExt=PathUtils.basenamenoext(data.Name);
					var input=$("#txtNewName")[0];
					input.setSelectionRange(0,baseNameNoExt.length);
					return;
				}
				documentService.renameDocument(copyOfData).then(function(response){
					if(response.code==0){
						$.pnotify("重命名成功","","success");
						$('#dlgRename').modal("hide");
						currentFileGridApi.searchParams=currentFolder.Id;
						currentFileGridApi.load(currentFileGridApi.jqGrid.children(qsFIRSTROWGROUP));//原先代码为fileGrid.children(qsFIRSTROWGROUP),好像有错误
					}else{
						$.pnotify(response.message,"错误提示","error");
					}
				});
			};
			if(oldExt&&newExt!=oldExt){
				$.confirmAsync("如果改变文件扩展名，文件可能不可用。\n确定要修改吗？").then(callback);
			}else{
				callback(true);
			}
		}
	});
	detailFileGridApi.jqGrid.on("click",".row-label",function(e){
		var row=$(this).closest("tr");
		var data=row.prop("data");
		if(data["Type"]=="Folder"){
			selectedRouteArray.push(data);
			breadcrumbDetailbApi.pushState(selectedRouteArray,null);
			detailFileGridApi.firstLoad=false;
			detailFileGridApi.searchParams=data["Id"];
			detailFileGridApi.currentFolder=data;
			detailFileGridApi.load(detailFileGridApi.jqGrid.children(qsFIRSTROWGROUP));
		}else{
			var row=$(this).closest("tr");
			var data=row.prop("data");
			openFile(data, data.ShareAuthority);
		}
	});
	breadcrumbDetailbApi.jqBreadcrumb.on("selecteditem",function(e){
		var item=e.detail;
		var data=item.prop("data");
		if(data.root){
			$("#lnkDetailBackHome").trigger("click");
			return;
		}
		if(data.rootSecond){//说明点中的节点是二级根节点
			detailFileGridApi.firstLoad=true;//此动态属性true：点击的是明细；false：点击的是明细的明细
		}
		var index=selectedRouteArray.indexOf(data);
		selectedRouteArray.splice(index+1,selectedRouteArray.length);
		breadcrumbDetailbApi.pushState(selectedRouteArray,null);
		detailFileGridApi.searchParams=data["Id"];
		detailFileGridApi.load(detailFileGrid.children(qsFIRSTROWGROUP));
	});
	receiveFileGridApi.jqGrid.on("loaded",function(e){
		var uuid=sessionStorage.getItem("received_uuid");
		if(uuid){//如果uuid不为空则视为通过链接地址接收分享文件，模拟鼠标点击事件跳转到所接收文件夹内部
			sessionStorage.removeItem("received_uuid");
			var rowData=null;
			e.detail.prop("data").some(function(data,index){
				if(data.UUID==uuid){
					rowData=data;
					return true;
				}
			});
			initdetailFileGrid(rowData,"receiveFileGrid")
		}
	});
	}
});
